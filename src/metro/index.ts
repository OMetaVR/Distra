import { proxyLazy } from "@/lib/lazy";

import { getCachedIds, setCachedIds } from "./cache";
import * as filters from "./filters";
import { allModules, initializedModules, onModuleRequired, requireModule } from "./modules";
import type { Filter, ModuleID } from "./types";

export { filters };
export * from "./filters";
export { getRegistry, requireModule } from "./modules";
export type { Filter, FilterFn, ModuleID, ModuleRecord, ModuleRegistry } from "./types";

export interface FindOptions {
    /** Return the module's full exports even when the filter matched `exports.default`. */
    raw?: boolean;
}

/**
 * Tests a module against a filter. ES modules are tested on their default export
 * first (Discord exports most components and stores that way).
 */
function match(filter: Filter, id: ModuleID, exports: any, raw: boolean): { value: any } | undefined {
    const def = exports.__esModule ? exports.default : undefined;
    if (def != null && filter(def, id, true)) return { value: raw ? exports : def };
    if (filter(exports, id, false)) return { value: exports };
    return undefined;
}

let trustKnownMisses = true;
/** Called once startup is over: from then on, lookups cached as misses are searched again. */
export function endStartupLookups() {
    trustKnownMisses = false;
}

const cacheKey = (filter: Filter, raw: boolean, all = false) =>
    `${filter.key}${raw ? ":raw" : ""}${all ? ":all" : ""}`;

/** Finds the first module matching `filter`. */
export function find(filter: Filter, { raw = false }: FindOptions = {}): any {
    // Filters with an empty key (ad-hoc predicates) are never cached.
    const key = filter.key ? cacheKey(filter, raw) : null;
    const cached = key ? getCachedIds(key) : undefined;

    // A full scan that found nothing is recorded as an empty list: it looked at every module of this
    // Discord build. Startup lookups run in the same order every launch, so during startup that
    // answer is trusted; later lookups (user actions, after other patches ran) still scan.
    if (cached?.length === 0 && trustKnownMisses) return undefined;

    for (const id of cached ?? []) {
        const exports = requireModule(id);
        const hit = exports !== undefined && match(filter, id, exports, raw);
        if (hit) return hit.value;
    }

    for (const [id, exports] of allModules()) {
        const hit = match(filter, id, exports, raw);
        if (hit) {
            if (key) setCachedIds(key, [id]);
            return hit.value;
        }
    }

    if (key) setCachedIds(key, []);
    return undefined;
}

/** Finds every module matching `filter`. Always scans the whole registry. */
export function findAll(filter: Filter, { raw = false }: FindOptions = {}): any[] {
    const found: any[] = [];
    const ids: ModuleID[] = [];
    for (const [id, exports] of allModules()) {
        const hit = match(filter, id, exports, raw);
        if (hit) {
            found.push(hit.value);
            ids.push(id);
        }
    }
    if (filter.key) setCachedIds(cacheKey(filter, raw, true), ids);
    return found;
}

/** Like `find`, but deferred until the result is first used. */
export function findLazy(filter: Filter, options?: FindOptions): any {
    return proxyLazy(() => find(filter, options), { hint: filter.key });
}

/**
 * Calls `callback` once a module matching `filter` is initialized (immediately if it already is).
 * Never initializes modules itself. Returns a function that cancels the wait.
 */
export function waitFor(filter: Filter, callback: (exports: any) => void, { raw = false }: FindOptions = {}): () => void {
    for (const [id, exports] of initializedModules()) {
        const hit = match(filter, id, exports, raw);
        if (hit) {
            callback(hit.value);
            return () => { };
        }
    }

    const unsubscribe = onModuleRequired((id, exports) => {
        const hit = match(filter, id, exports, raw);
        if (!hit) return;
        unsubscribe();
        callback(hit.value);
    });
    return unsubscribe;
}

// Convenience wrappers, matching the API shape plugins from other mods expect.

/** Discord's design-system index, which re-exports every design component (TableRow, Stack, Button, ...). */
const DESIGN_HUB = "design/native.tsx";
let designHub: any;
/** The hub once Discord has loaded it (it does at startup); never initializes modules itself. */
function getDesignHub() {
    if (designHub) return designHub;
    for (const [, exports, record] of initializedModules()) {
        if (record.__filePath === DESIGN_HUB) return designHub = exports;
    }
    return undefined;
}

/** React Native's index module (exports AppRegistry, NativeModules, Button, TextInput, ...). */
const isReactNativeIndex = (m: any) => m != null && typeof m === "object"
    && Object.getOwnPropertyDescriptor(m, "AppRegistry") != null && Object.getOwnPropertyDescriptor(m, "NativeModules") != null;

const byPropsNotReactNative = filters.createFilter<string[]>("byPropsNotReactNative", (props, m) =>
    !isReactNativeIndex(m) && props.length > 0 && props.every(prop => m[prop] != null));

/**
 * Finds the first module exporting all `props`. Plugins written for older Discord expect design
 * components from the design-system index (it used to be the first match; now e.g. "TableRow"
 * first hits TableRow.native.tsx, which lacks TableSwitchRow/TableRowGroup), and Discord's
 * components over React Native's same-named ones ("Button", "TextInput").
 */
export function findByProps(...props: string[]) {
    const hub = props.length > 0 ? getDesignHub() : null;
    if (hub && props.every(prop => {
        try {
            return hub[prop] != null;
        } catch {
            return false;
        }
    })) return hub;

    const found = find(filters.byProps(...props));
    if (!isReactNativeIndex(found)) return found;
    return find(byPropsNotReactNative(...props)) ?? found;
}
export const findByPropsLazy = (...props: string[]) => proxyLazy(() => findByProps(...props), { hint: `findByProps(${props.join(", ")})` });
export const findByPropsAll = (...props: string[]) => findAll(filters.byProps(...props));

/**
 * Name lookups with a fallback for minified names: when no function/component is
 * named `name`, the module whose source file is `name.tsx` is used instead (its default
 * export, unless `expDefault` is false). Files under `native/` win over shared ones.
 */
function byNameOrFile(filter: Filter, name: string, expDefault: boolean) {
    const exact = find(filter, { raw: !expDefault });
    if (exact !== undefined) return exact;
    return findFile(name, expDefault);
}

/** A file's default export, or the export named after the file (Navigator.tsx exports `Navigator`). */
const fileExport = (exports: any, name: string) => exports.default ?? (exports[name] !== undefined ? exports[name] : exports);

function findFile(name: string, expDefault: boolean) {
    // Uppercase component names and hooks (useFoo) are the only ones that map cleanly to files.
    if (!/^(?:[A-Z]|use[A-Z])/.test(name)) return undefined;
    const filter = filters.byFileName(name);
    const key = `${filter.key}${expDefault ? "" : ":raw"}`;
    const cachedIds = getCachedIds(key);
    if (cachedIds?.length === 0 && trustKnownMisses) return undefined; // known miss for this build (see `find`)
    const cached = cachedIds?.[0];
    if (cached !== undefined) {
        const exports = requireModule(cached);
        if (exports !== undefined) return expDefault ? fileExport(exports, name) : exports;
    }

    let best: { id: ModuleID; exports: any; native: boolean } | undefined;
    for (const [id, exports, record] of allModules()) {
        if (!filter(exports, id, false)) continue;
        const native = /\/native\//.test(record.__filePath ?? "");
        if (!best || (native && !best.native)) best = { id, exports, native };
        if (native) break;
    }
    if (!best) {
        setCachedIds(key, []);
        return undefined;
    }
    setCachedIds(key, [best.id]);
    return expDefault ? fileExport(best.exports, name) : best.exports;
}

const allByNameOrFile = (filter: Filter, name: string, expDefault: boolean) => {
    const exact = findAll(filter, { raw: !expDefault });
    if (exact.length) return exact;
    const file = findFile(name, expDefault);
    return file === undefined ? [] : [file];
};

export const findByName = (name: string, expDefault = true) => byNameOrFile(filters.byName(name), name, expDefault);
export const findByNameLazy = (name: string, expDefault = true) => proxyLazy(() => findByName(name, expDefault), { hint: `findByName(${name})` });
export const findByNameAll = (name: string, expDefault = true) => allByNameOrFile(filters.byName(name), name, expDefault);

export const findByDisplayName = (name: string, expDefault = true) => byNameOrFile(filters.byDisplayName(name), name, expDefault);
export const findByDisplayNameLazy = (name: string, expDefault = true) => proxyLazy(() => findByDisplayName(name, expDefault), { hint: `findByDisplayName(${name})` });
export const findByDisplayNameAll = (name: string, expDefault = true) => allByNameOrFile(filters.byDisplayName(name), name, expDefault);

export const findByTypeName = (name: string, expDefault = true) => byNameOrFile(filters.byTypeName(name), name, expDefault);
export const findByTypeNameLazy = (name: string, expDefault = true) => proxyLazy(() => findByTypeName(name, expDefault), { hint: `findByTypeName(${name})` });
export const findByTypeNameAll = (name: string, expDefault = true) => allByNameOrFile(filters.byTypeName(name), name, expDefault);

export const findByTypeDisplayNameLazy = (name: string, expDefault = true) => proxyLazy(() => byNameOrFile(filters.byTypeDisplayName(name), name, expDefault), { hint: `findByTypeDisplayName(${name})` });

export const findByFileName = (name: string, expDefault = true) => findFile(name, expDefault);

export const findByStoreName = (name: string) => find(filters.byStoreName(name));
export const findByStoreNameLazy = (name: string) => findLazy(filters.byStoreName(name));

export const findByFilePath = (path: string, expDefault = false) => find(filters.byFilePath(path), { raw: !expDefault });
export const findByFilePathLazy = (path: string, expDefault = false) => findLazy(filters.byFilePath(path), { raw: !expDefault });
