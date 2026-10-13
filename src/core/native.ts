// Access to React Native native modules in both the legacy bridge
// (`nativeModuleProxy`) and bridgeless/TurboModule (`__turboModuleProxy`) worlds.

declare global {
    // eslint-disable-next-line no-var
    var nativeModuleProxy: Record<string, any> | undefined;
    // eslint-disable-next-line no-var
    var __turboModuleProxy: ((name: string) => any) | undefined;
}

/** Discord's own `nativeModuleProxy`, before `installNativeModuleAliases` wrapped it. */
let realProxy: Record<string, any> | undefined;

export function getNativeModule<T = any>(...names: string[]): T | undefined {
    for (const name of names) {
        try {
            const turbo = globalThis.__turboModuleProxy?.(name);
            if (turbo) return turbo as T;
        } catch { }
        const legacy = (realProxy ?? globalThis.nativeModuleProxy)?.[name];
        if (legacy) return legacy as T;
    }
    return undefined;
}

export const NativeModules = {
    get ClientInfo() {
        return getNativeModule("NativeClientInfoModule", "RTNClientInfoManager", "InfoDictionaryManager");
    },
    get BundleUpdater() {
        return getNativeModule("BundleUpdaterManager");
    },
    get Device() {
        return getNativeModule("NativeDeviceModule", "RTNDeviceManager", "DCDDeviceManager");
    },
};

/** Reloads the JS context without killing the app. */
export function reloadApp() {
    const updater = NativeModules.BundleUpdater;
    if (typeof updater?.reload === "function") return void updater.reload();
    throw new Error("BundleUpdaterManager.reload is unavailable");
}

// Discord moved most of its native modules to TurboModules under new names. Plugins written for
// older versions still read the old names from `ReactNative.NativeModules` (which is
// `nativeModuleProxy`), so those names resolve to their replacements here.
const LEGACY_NAMES: Record<string, string[]> = {
    MediaManager: ["NativeMediaManagerModule"],
    DCDFileManager: ["NativeFileModule", "RTNFileManager"],
    RTNFileManager: ["NativeFileModule", "DCDFileManager"],
    MMKVManager: ["NativeCacheModule"],
    DCDLinkingManager: ["NativeLinkingModule"],
    DCDTheme: ["NativeThemeModule", "RTNThemeManager"],
    RTNThemeManager: ["NativeThemeModule", "DCDTheme"],
    DCDDeviceManager: ["NativeDeviceModule", "RTNDeviceManager"],
    RTNDeviceManager: ["NativeDeviceModule", "DCDDeviceManager"],
    InfoDictionaryManager: ["NativeClientInfoModule", "RTNClientInfoManager"],
    RTNClientInfoManager: ["NativeClientInfoModule", "InfoDictionaryManager"],
    DCDClipboardManager: ["NativeClipboardModule"],
    DCDSoundManager: ["NativeSoundModule"],
    DCDNotificationCategoryUtils: ["NativeNotificationCategoryUtilsModule"],
};

/**
 * Old `DCDChatManager`: chat rows now go to the DCDChat native component's `updateRows` command
 * (with the same arguments: view, rows JSON, ...). `patchChatCommands` routes those calls
 * through this object so plugins patching `DCDChatManager.updateRows` keep working.
 */
let chatUpdateRows: ((...args: any[]) => unknown) | undefined;
export const chatManagerShim: Record<string, any> = {
    updateRows: (...args: unknown[]) => chatUpdateRows?.(...args),
};

/** Sets where `chatManagerShim.updateRows` forwards to (plugins may already have patched it). */
export const setChatUpdateRows = (fn: (...args: any[]) => unknown) => void (chatUpdateRows = fn);

const aliasCache = new Map<string, any>();

/**
 * Legacy modules exposed their constants as properties; TurboModules return them from
 * `getConstants()`. The alias reads both, and stores assignments (patches) on itself.
 */
function legacyView(module: any) {
    let constants: Record<string, any> | undefined;
    const overrides: Record<string | symbol, any> = Object.create(null);
    const constant = (key: string | symbol) => {
        if (typeof key !== "string") return undefined;
        try {
            constants ??= module.getConstants?.() ?? {};
        } catch {
            constants = {};
        }
        return constants![key];
    };
    return new Proxy({}, {
        get(_, key) {
            if (key in overrides) return overrides[key];
            const value = module[key];
            return value !== undefined ? value : constant(key);
        },
        set(_, key, value) {
            overrides[key] = value;
            return true;
        },
        has: (_, key) => key in overrides || module[key] !== undefined || constant(key) !== undefined,
        deleteProperty(_, key) {
            delete overrides[key];
            return true;
        },
    });
}

function resolveAlias(name: string) {
    if (name === "DCDChatManager") return chatManagerShim;
    if (aliasCache.has(name)) return aliasCache.get(name);
    let module: any;
    for (const replacement of LEGACY_NAMES[name] ?? []) {
        module = getNativeModule(replacement);
        if (module) break;
    }
    const alias = module ? legacyView(module) : undefined;
    aliasCache.set(name, alias);
    return alias;
}

/**
 * Wraps `nativeModuleProxy` so legacy module names resolve. Must run before Discord's bundle
 * reads it (React Native's NativeModules module captures it once).
 */
export function installNativeModuleAliases() {
    const proxy = globalThis.nativeModuleProxy;
    if (proxy == null || realProxy) return;
    realProxy = proxy;

    const lookup = (key: string | symbol) => {
        let value;
        try {
            value = proxy[key as any];
        } catch { }
        if (value != null || typeof key !== "string") return value;
        return key in LEGACY_NAMES || key === "DCDChatManager" ? resolveAlias(key) : value;
    };
    const wrapped = new Proxy({}, {
        get: (_, key) => lookup(key),
        set(_, key, value) {
            try {
                proxy[key as any] = value;
            } catch { }
            return true;
        },
        has: (_, key) => lookup(key) != null,
        ownKeys: () => {
            try {
                return Reflect.ownKeys(proxy);
            } catch {
                return [];
            }
        },
        getOwnPropertyDescriptor(_, key) {
            const value = lookup(key);
            return value === undefined ? undefined : { value, writable: true, enumerable: true, configurable: true };
        },
    });

    try {
        globalThis.nativeModuleProxy = wrapped;
    } catch {
        realProxy = undefined;
    }
}
