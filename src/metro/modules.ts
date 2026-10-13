// Low-level access to Metro's module registry. Nothing here may touch
// `globalThis.modules` at import time: this file is imported before Discord's
// bundle has defined any module.

import { instead } from "spitroast";

import type { ModuleID, ModuleRecord, ModuleRegistry } from "./types";

const blacklist = new Set<ModuleID>();
const requireListeners = new Set<(id: ModuleID, exports: any) => void>();
let importingModuleId: ModuleID = -1;
let factoriesPatched = false;

export const getRegistry = (): ModuleRegistry => globalThis.modules;

const metroRequire = (id: ModuleID) => globalThis.__r(id);

/** Exports that must never be returned from a find (they break filters or explode on access). */
export function isBadExports(exports: any): boolean {
    if (exports == null || exports === globalThis) return true;
    if (typeof exports !== "object" && typeof exports !== "function") return true;
    try {
        // Catch-all proxies return a value (even null) for any key, e.g. Discord's i18n message
        // proxies, and one in Discord 348 that returns null for every property name. They would
        // match any byProps filter.
        if (exports.discordiaCatchAllProbe !== undefined || exports["\u0000discordia-probe\u0000"] !== undefined) return true;
        if (exports.constructor === null) return true;
        if (exports.default?.[Symbol.toStringTag] === "IntlMessagesProxy") return true;
        if (Object.getPrototypeOf(exports) === Object.prototype && Reflect.ownKeys(exports).length === 0) return true;
    } catch {
        return true;
    }
    return false;
}

export function blacklistModule(id: ModuleID) {
    blacklist.add(id);
    const registry = getRegistry();
    if (registry?.[id]) {
        try {
            Object.defineProperty(registry, id, { enumerable: false });
        } catch { }
    }
}

export const isBlacklisted = (id: ModuleID) => blacklist.has(id);

export function onModuleRequired(listener: (id: ModuleID, exports: any) => void) {
    requireListeners.add(listener);
    return () => void requireListeners.delete(listener);
}

/** The module currently running its factory, or -1. */
export const getImportingModuleId = () => importingModuleId;

/**
 * Wraps every module factory so we can observe initialization (for `waitFor`
 * and file path tracking). Must run after Discord defined its modules but
 * before module 0 (the app entry) is required.
 */
export function patchModuleFactories() {
    if (factoriesPatched) return;
    factoriesPatched = true;

    const registry = getRegistry();
    for (const key in registry) {
        const id = Number(key);
        const record = registry[id];
        if (!record?.factory || record.isInitialized) continue;

        instead("factory", record, (args: any[], original: (...a: any[]) => void) => {
            // Metro's importDefault/importAll cache a module's default export (and a copy of its
            // exports) on first use, so patches applied later to `exports.default` would never be
            // seen by importers. Resolve them on every call instead (as Kettu does).
            const metroRequireArg = args[1];
            args[2] = (moduleId: ModuleID) => {
                const exports = metroRequireArg(moduleId);
                return exports && exports.__esModule ? exports.default : exports;
            };
            args[3] = (moduleId: ModuleID) => {
                const exports = metroRequireArg(moduleId);
                if (exports && exports.__esModule) return exports;
                return Object.assign({}, exports, { default: exports });
            };

            const previous = importingModuleId;
            importingModuleId = id;
            try {
                const ret = original(...args);
                const exports = record.publicModule?.exports;
                if (isBadExports(exports)) blacklistModule(id);
                else onRequire(id, exports);
                return ret;
            } finally {
                importingModuleId = previous;
            }
        });
    }
}

/** A minifier-generated function name: empty, or at most two characters ("o", "$1"). */
const isMinifiedName = (name: unknown) => typeof name !== "string" || name.length <= 2;

/** Component (function, memo or forwardRef object) -> "path/to/File.tsx#ExportName", for debugging. */
export const componentSources = new WeakMap<object, string>();

function nameFunction(fn: any, name: string) {
    if (typeof fn !== "function" || !isMinifiedName(fn.name)) return;
    try {
        Object.defineProperty(fn, "name", { value: name, configurable: true });
    } catch { }
}

/**
 * Discord minifies most component names, but plugins written for older versions find elements by
 * `type.name` ("TableRow", "ActionSheetRow", ...). Minified components get their export name back
 * (the source file name for default exports), including inside memo() / forwardRef() wrappers.
 */
function restoreComponentNames(exports: any, filePath: string) {
    const fileName = filePath.slice(filePath.lastIndexOf("/") + 1).replace(/(?:\.(?:native|ios|android))?\.[jt]sx?$/, "");
    const restore = (value: any, name: string) => {
        if (!/^[A-Z]/.test(name) || value == null) return;
        if ((typeof value === "function" || typeof value === "object") && !componentSources.has(value)) {
            componentSources.set(value, `${filePath}#${name}`);
        }
        if (typeof value === "function") {
            nameFunction(value, name);
            // Static sub-components: TableRow.Icon was "TableRowIcon", ActionSheetRow.Group "ActionSheetRowGroup".
            for (const key of ["Icon", "Group", "Arrow", "Title", "Header", "Footer", "Item", "Row", "Text"]) {
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (descriptor && "value" in descriptor) nameFunction(descriptor.value, name + key);
            }
            return;
        }
        if (typeof value !== "object") return;
        // memo(Component), forwardRef(render), memo(forwardRef(render))
        const inner = value.type ?? value.render;
        const render = typeof inner === "function" ? inner : typeof inner?.render === "function" ? inner.render : undefined;
        if (!render) return;
        nameFunction(render, name);
        if (!componentSources.has(render)) componentSources.set(render, `${filePath}#${name}`);
        if (value.name === undefined) {
            try {
                Object.defineProperty(value, "name", { value: name, configurable: true });
            } catch { }
        }
    };
    try {
        if (!exports.__esModule) return restore(exports, fileName);
        // Data properties only: re-exports are getters that would initialize other modules early.
        for (const key of Object.keys(exports)) {
            const descriptor = Object.getOwnPropertyDescriptor(exports, key);
            if (descriptor && "value" in descriptor) restore(descriptor.value, key === "default" ? fileName : key);
        }
    } catch { }
}

let filePathTrackerPatched = false;
function onRequire(id: ModuleID, exports: any) {
    // Discord calls `fileFinishedImporting("modules/foo/Bar.tsx")` at the end of most
    // modules; recording it lets us find modules by their original source path.
    if (!filePathTrackerPatched && typeof exports.fileFinishedImporting === "function") {
        filePathTrackerPatched = true;
        instead("fileFinishedImporting", exports, (args: any[], original: (...a: any[]) => unknown) => {
            const [filePath] = args;
            const record = importingModuleId !== -1 ? getRegistry()[importingModuleId] : undefined;
            if (record && typeof filePath === "string") record.__filePath = filePath;
            return original(...args);
        });
    }

    const filePath = getRegistry()[id]?.__filePath;
    if (filePath) restoreComponentNames(exports, filePath);

    for (const listener of requireListeners) {
        try {
            listener(id, exports);
        } catch (e) {
            console.error("[Discordia] module listener failed", e);
        }
    }
}

/**
 * Requires a module, returning undefined (and blacklisting it) instead of throwing.
 * Discord's global error handler is silenced so failed side modules don't surface as red boxes.
 */
export function requireModule(id: ModuleID): any {
    const registry = getRegistry();
    const record = registry?.[id];
    if (!record || blacklist.has(id)) return undefined;

    if (record.isInitialized) {
        if (record.hasError) return undefined;
        return record.publicModule.exports;
    }

    const errorUtils = (globalThis as any).ErrorUtils;
    const originalHandler = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler?.(() => { });

    try {
        const exports = metroRequire(id);
        if (isBadExports(exports)) {
            blacklistModule(id);
            return undefined;
        }
        return exports;
    } catch {
        blacklistModule(id);
        return undefined;
    } finally {
        if (originalHandler) errorUtils.setGlobalHandler(originalHandler);
    }
}

/** Already-initialized modules only; never runs a factory. */
export function* initializedModules(): Generator<[ModuleID, any, ModuleRecord]> {
    const registry = getRegistry();
    for (const key in registry) {
        const id = Number(key);
        const record = registry[id];
        if (!record?.isInitialized || record.hasError || blacklist.has(id)) continue;
        const exports = record.publicModule.exports;
        if (isBadExports(exports)) {
            blacklistModule(id);
            continue;
        }
        yield [id, exports, record];
    }
}

/**
 * Every module, initializing them as needed. Initialized modules are visited first
 * so common lookups rarely have to run new factories.
 */
export function* allModules(): Generator<[ModuleID, any, ModuleRecord]> {
    const visited = new Set<ModuleID>();
    for (const entry of initializedModules()) {
        visited.add(entry[0]);
        yield entry;
    }

    // Initialize Discord's entry module before anything else so remaining modules
    // see the same global state they would during a normal startup.
    const registry = getRegistry();
    if (registry[0] && !registry[0].isInitialized) requireModule(0);

    for (const key in registry) {
        const id = Number(key);
        const record = registry[id];
        if (!record || visited.has(id) || blacklist.has(id)) continue;
        const exports = requireModule(id);
        if (exports !== undefined) yield [id, exports, record];
    }
}
