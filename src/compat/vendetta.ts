// `window.vendetta`: the API Vendetta (and Bunny/Kettu, for "Vendetta plugins")
// exposed to plugins. Most plugins in the wild target this shape.
// Reference: examples/Kettu-github/src/core/vendetta/api.tsx

import { loader } from "@/core/loader";
import { loaderConfig, settings } from "@/core/settings";
import * as storage from "@/core/storage";
import { findAssetId, getAssetById } from "@/lib/assets";
import { registerCommand, unregisterCommand } from "@/lib/commands";
import { proxyLazy, unwrapLazy } from "@/lib/lazy";
import { Logger } from "@/lib/logger";
import { after, before, instead } from "@/lib/patcher";
import { findInReactTree, findInTree } from "@/lib/utils";
import * as metro from "@/metro";
import * as common from "@/metro/common";
import { fromPredicate } from "@/metro/filters";
import { pluginDataPath } from "@/plugins/paths";
import * as pluginManager from "@/plugins/manager";
import { showConfirmationAlert, showInputAlert } from "@/ui/alerts";
import { constantsWithColors, rawColors, resolveSemanticColor, semanticColors } from "@/ui/color";
import { Codeblock, Search } from "@/ui/CompatComponents";
import * as components from "@/ui/components";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { createThemedStyleSheet } from "@/ui/styles";
import { createThemesApi } from "./themes";
import { showToast } from "@/ui/toasts";

// Vendetta's find() takes bare predicates. They can close over arbitrary state,
// so they get no cache key (see metro/index.ts).
const adhoc = (predicate: (m: any) => boolean) => fromPredicate(predicate, "");

const VD_PROXY_PREFIX = "https://vd-plugins.github.io/proxy";

/** Exports Discord removed, and what replaced them (null: no replacement, a View stands in). */
const LEGACY_EXPORTS: Record<string, string | null> = {
    ActionSheetTitleHeader: "BottomSheetTitleHeader",
    ActionSheetContentContainer: null,
};

/** Row components that became statics of ActionSheetRow (`ActionSheetRow.Group`). */
const ROW_STATICS: Record<string, string> = { ActionSheetRowGroup: "Group", ActionSheetRowIcon: "Icon", Group: "Group", Icon: "Icon" };

function LegacyContainer({ children }: { children?: React.ReactNode }) {
    return common.React.createElement(common.ReactNative.View, null, children);
}

/**
 * Vendetta's findByProps, plus fallbacks for removed exports (as Kettu does): a lookup for
 * `ActionSheetTitleHeader` finds the module with `BottomSheetTitleHeader` and aliases it.
 */
function findByPropsCompat(...props: string[]) {
    // A lone "KeyboardAwareScrollView" also matches modules that merely re-export it.
    if (props.length === 1 && props[0] === "KeyboardAwareScrollView") props = [...props, "listenToKeyboardEvents"];
    // `findByProps("ScrollView")` meant React Native itself; Animated also exports ScrollView/View now.
    if (props.length === 1 && props[0] === "ScrollView") props = [...props, "AppRegistry"];

    const found = metro.findByProps(...props);
    if (found != null) return found;

    // findByProps("ActionSheetRowGroup") / findByProps("ActionSheetRow", "Group"): the row module, with the statics as exports.
    if (props.some(prop => prop in ROW_STATICS) && props.every(prop => prop in ROW_STATICS || prop === "ActionSheetRow")) {
        const rows = metro.findByProps("ActionSheetRow");
        const Row = rows?.ActionSheetRow;
        if (Row && props.every(prop => prop === "ActionSheetRow" || Row[ROW_STATICS[prop]])) {
            return { ...rows, ...Object.fromEntries(props.filter(prop => prop in ROW_STATICS).map(prop => [prop, Row[ROW_STATICS[prop]]])) };
        }
    }
    if (!props.some(prop => prop in LEGACY_EXPORTS)) return found;

    const modern = props.flatMap(prop => prop in LEGACY_EXPORTS ? (LEGACY_EXPORTS[prop] ? [LEGACY_EXPORTS[prop]!] : []) : [prop]);
    const base = modern.length ? metro.findByProps(...modern) : metro.findByProps("ActionSheetRow");
    if (base == null) return undefined;
    const aliases = Object.fromEntries(props.filter(prop => prop in LEGACY_EXPORTS)
        .map(prop => [prop, LEGACY_EXPORTS[prop] ? base[LEGACY_EXPORTS[prop]!] : LegacyContainer]));
    return { ...base, ...aliases };
}

export const vendettaLoaderIdentity = {
    name: loader.name,
    features: {
        loaderConfig: true,
    },
};

/**
 * Vendetta's `assets.all` (every registered asset by name; NexxUtils' toast test picks from it).
 * A non-enumerable getter, so spreading the assets API (Bunny's does) doesn't build it eagerly.
 */
function withAllAssets<T extends object>(api: T): T & { readonly all: Record<string, any> } {
    Object.defineProperty(api, "all", {
        enumerable: false,
        get() {
            const all: Record<string, any> = {};
            for (let id = 1; ; id++) {
                const asset = getAssetById(id);
                if (!asset) break;
                all[asset.name] ??= { ...asset, id };
            }
            return all;
        },
    });
    return api as any;
}

export function createVendettaObject() {
    const metroApi = {
        modules: globalThis.modules,
        find: (filter: (m: any) => boolean) => metro.find(adhoc(filter)),
        findAll: (filter: (m: any) => boolean) => metro.findAll(adhoc(filter)),
        findByProps: findByPropsCompat,
        findByPropsAll: (...props: string[]) => metro.findByPropsAll(...props),
        findByName: (name: string, defaultExp?: boolean) => {
            // Decor's findByName("create") meant the zustand-style `create` module's default (as in Kettu).
            if (name === "create" && defaultExp === undefined) return metro.findByName("create", false)?.default;
            return metro.findByName(name, defaultExp ?? true);
        },
        findByNameAll: (name: string, defaultExp = true) => metro.findByNameAll(name, defaultExp),
        findByDisplayName: (name: string, defaultExp = true) => metro.findByDisplayName(name, defaultExp),
        findByDisplayNameAll: (name: string, defaultExp = true) => metro.findByDisplayNameAll(name, defaultExp),
        findByTypeName: (name: string, defaultExp = true) => metro.findByTypeName(name, defaultExp),
        findByTypeNameAll: (name: string, defaultExp = true) => metro.findByTypeNameAll(name, defaultExp),
        findByStoreName: (name: string) => metro.findByStoreName(name),
        common: {
            constants: constantsWithColors,
            channels: metro.findByPropsLazy("getVoiceChannelId"),
            i18n: common.i18n,
            url: common.url,
            toasts: common.toasts,
            clipboard: common.clipboard,
            assets: common.assetsRegistry,
            invites: metro.findByPropsLazy("acceptInviteAndTransitionToInviteChannel"),
            commands: common.commands,
            navigation: common.navigation,
            navigationStack: common.navigationStack,
            NavigationNative: common.NavigationNative,
            Flux: common.Flux,
            FluxDispatcher: common.FluxDispatcher,
            React: common.React,
            ReactNative: common.ReactNative,
            stylesheet: { createThemedStyleSheet },
            moment: metro.findByPropsLazy("isMoment"),
            chroma: metro.findByPropsLazy("brewer"),
            lodash: metro.findByPropsLazy("forEachRight"),
            util: metro.findByPropsLazy("inspect", "isNullOrUndefined"),
        },
    };

    return {
        version: `distra-${DISTRA_VERSION}`,
        patcher: { before, after, instead },
        metro: metroApi,
        constants: {
            DISCORD_SERVER: "https://discord.gg/n9QQ4XhhJP",
            GITHUB: "https://github.com/vendetta-mod",
            PROXY_PREFIX: VD_PROXY_PREFIX,
            HTTP_REGEX: /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)$/,
            HTTP_REGEX_MULTI: /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=]*)/g,
            DISCORD_SERVER_ID: "1015931589865246730",
            PLUGINS_CHANNEL_ID: "1091880384561684561",
            THEMES_CHANNEL_ID: "1091880434939482202",
        },
        utils: {
            findInReactTree,
            findInTree,
            safeFetch: (input: RequestInfo, options?: RequestInit) => fetch(input, { cache: "no-store", ...options } as RequestInit),
            unfreeze: (object: object) => Object.isFrozen(object) ? { ...object } : object,
            without: (object: Record<string, unknown>, ...keys: string[]) =>
                Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key))),
        },
        debug: {
            connectToDebugger: () => console.warn("[Distra] connectToDebugger is not supported yet"),
            getDebugInfo,
        },
        ui: {
            components: {
                Forms: components.Forms,
                General: common.ReactNative,
                ErrorBoundary,
                Button: metro.findByPropsLazy("Looks", "Colors", "Sizes"),
                Alert: proxyLazy(() => metro.findByDisplayName("FluxContainer(Alert)")),
                HelpMessage: proxyLazy(() => metro.findByName("HelpMessage")),
                SafeAreaView: components.SafeAreaView,
                Codeblock,
                Search,
            },
            toasts: { showToast },
            alerts: { showConfirmationAlert, showInputAlert },
            // Vendetta spread its color module into `ui`; `@vendetta/ui/colors` also exists in some plugins.
            semanticColors,
            rawColors,
            colors: { semanticColors, rawColors, resolveSemanticColor },
            assets: withAllAssets({
                find: (filter: (asset: any) => boolean) => {
                    for (let id = 1; ; id++) {
                        const asset = getAssetById(id);
                        if (!asset) return undefined;
                        if (filter(asset)) return { ...asset, id };
                    }
                },
                getAssetByName: (name: string) => {
                    const id = findAssetId(name);
                    return id === undefined ? undefined : { ...getAssetById(id), id };
                },
                getAssetByID: getAssetById,
                getAssetIDByName: findAssetId,
            }),
        },
        commands: {
            registerCommand,
            unregisterCommand,
            unregisterAllCommands: () => console.warn("[Distra] unregisterAllCommands: commands are removed when their plugin stops"),
        },
        plugins: createPluginsApi(),
        themes: createThemesApi(),
        storage: {
            createProxy: storage.createProxy,
            useProxy: storage.useProxy,
            createStorage: storage.createStorage,
            wrapSync: storage.wrapSync,
            awaitSyncWrapper: (store: object) => storage.awaitStorage(store),
            // MMKV keys and Vendetta's file paths both map to files under plugins/data.
            createMMKVBackend: (key: string) => storage.createFileBackend(pluginDataPath(key)),
            createFileBackend: (path: string) => storage.createFileBackend(pluginDataPath(path)),
        },
        settings,
        loader: {
            identity: vendettaLoaderIdentity,
            config: loaderConfig,
        },
        logger: new Logger("Vendetta"),
        unload: () => console.warn("[Distra] vendetta.unload() is not supported"),
    };
}

/** Vendetta's `debug.getDebugInfo()`: versions, OS and device, in the same shape. */
function getDebugInfo() {
    const RN = common.ReactNative;
    const constants: any = RN.Platform?.constants ?? {};
    const rnVersion = constants.reactNativeVersion;
    let hermes: Record<string, any> = {};
    try {
        hermes = (globalThis as any).HermesInternal?.getRuntimeProperties?.() ?? {};
    } catch { }
    let device: Record<string, any> = {};
    try {
        const module = RN.NativeModules.DCDDeviceManager;
        device = module?.getConstants?.() ?? module ?? {};
    } catch { }
    return {
        vendetta: { version: DISTRA_VERSION, loader: loader.name },
        discord: { version: loader.discord.version, build: loader.discord.build },
        react: {
            version: common.React.version,
            nativeVersion: rnVersion ? `${rnVersion.major}.${rnVersion.minor}.${rnVersion.patch}${rnVersion.prerelease ? `-${rnVersion.prerelease}` : ""}` : undefined,
        },
        hermes: {
            version: hermes["OSS Release Version"],
            buildType: hermes.Build,
            bytecodeVersion: hermes["Bytecode Version"],
        },
        os: { name: constants.systemName ?? RN.Platform?.OS, version: constants.osVersion ?? RN.Platform?.Version },
        device: {
            manufacturer: device.deviceManufacturer,
            brand: device.deviceBrand,
            model: device.deviceModel,
            codename: device.device ?? device.deviceProduct,
        },
    };
}

/** Vendetta-flavored built-ins, keyed by the url Vendetta would have installed them from. */
function builtinsByUrl() {
    return new Map(Object.values(pluginManager.builtins)
        .filter(record => record.flavor === "vendetta")
        .map(record => [record.builtin?.upstreamInstallUrl ? pluginManager.normalizeUrl(record.builtin.upstreamInstallUrl) : record.id, record]));
}

/** Plugin ids as Vendetta plugins see them (urls) to Distra's ids. Built-ins answer for their upstream url. */
function resolveId(id: string) {
    if (pluginManager.plugins[id]) return id;
    return builtinsByUrl().get(pluginManager.normalizeUrl(id))?.id ?? id;
}

/**
 * A live view of `build()` that also carries a Vendetta storage emitter, like Vendetta's own
 * `plugins`/`themes` storages (Cloud Sync, Plugin Browser subscribe to it). `watch` wires up when it fires.
 */
function liveView(build: () => Record<string, any>, watch: (emitter: storage.Emitter) => void) {
    const emitter = new storage.Emitter();
    watch(emitter);
    return new Proxy({}, {
        get: (_, key) => key === storage.vendettaEmitterSymbol ? emitter : build()[key as string],
        has: (_, key) => key in build(),
        ownKeys: () => Reflect.ownKeys(build()),
        getOwnPropertyDescriptor: (_, key) => {
            const value = build()[key as string];
            return value === undefined ? undefined : { value, writable: false, enumerable: true, configurable: true };
        },
    });
}

/** Vendetta's plugin manager API, mapped onto Distra's. Enabled built-in plugins are listed too. */
function createPluginsApi() {
    const entry = (id: string, record: any) => [id, { id, manifest: record.manifest, enabled: record.enabled, update: record.autoUpdate, js: "" }];
    const plugins = liveView(() => Object.fromEntries([
        // Disabled built-ins count as not installed.
        ...[...builtinsByUrl()].filter(([, record]) => record.enabled).map(([url, record]) => entry(url, record)),
        ...Object.values(pluginManager.plugins).filter(record => record.flavor === "vendetta").map(record => entry(record.id, record)),
    ]), emitter => pluginManager.onPluginsChanged(event => emitter.emit(event)));
    return {
        plugins,
        fetchPlugin: (id: string) => pluginManager.plugins[resolveId(id)] ? pluginManager.updatePlugin(resolveId(id)) : Promise.resolve(),
        installPlugin: (id: string, enabled = true) => {
            const builtin = resolveId(id);
            // Installing a plugin Distra already ships enables the built-in copy instead.
            if (pluginManager.builtins[builtin]) return enabled ? pluginManager.enablePlugin(builtin).then(() => undefined) : Promise.resolve();
            return pluginManager.installPlugin(id, "vendetta", enabled).then(() => undefined);
        },
        startPlugin: (id: string) => pluginManager.enablePlugin(resolveId(id)),
        stopPlugin: (id: string, disable = true) => disable ? pluginManager.disablePlugin(resolveId(id)) : pluginManager.stopPlugin(resolveId(id)),
        removePlugin: (id: string) => pluginManager.builtins[resolveId(id)] ? pluginManager.disablePlugin(resolveId(id)) : pluginManager.uninstallPlugin(id),
        getSettings: (id: string) => pluginManager.getInstance(resolveId(id))?.SettingsComponent,
    };
}

export type VendettaObject = ReturnType<typeof createVendettaObject>;

declare global {
    // eslint-disable-next-line no-var
    var vendetta: VendettaObject | undefined;
    // eslint-disable-next-line no-var
    var __vendetta_loader: typeof vendettaLoaderIdentity | undefined;
}

/** Installs `window.vendetta` and the loader identity Vendetta-era code checks for. */
export function installVendettaGlobals() {
    globalThis.__vendetta_loader ??= vendettaLoaderIdentity;
    // Vendetta (and every loader since) set these globals; plugins rely on them both for
    // classic-runtime JSX (`React.createElement`) and for `import ... from "react"`.
    (globalThis as any).React = unwrapLazy(common.React);
    (globalThis as any).ReactNative = unwrapLazy(common.ReactNative);
    globalThis.vendetta = createVendettaObject();
}
