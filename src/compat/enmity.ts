// `window.enmity` (and `window.aliucord`, whose API Enmity grew out of).
// Enmity plugins are single JS files that import from `enmity/*`, which their
// build turns into `window.enmity.*` accesses, and call
// `window.enmity.plugins.registerPlugin(plugin)` when evaluated.
// Reference: examples/enmity/src/api/index.ts
//
// This is a partial implementation covering the commonly used surface.

import { readJSON, writeJSON } from "@/core/fs";
import { reloadApp } from "@/core/native";
import { findAssetId, getAssetById } from "@/lib/assets";
import { type Command, registerCommand } from "@/lib/commands";
import { sendLocalMessage } from "@/lib/localMessage";
import { proxyLazy, unwrapLazy } from "@/lib/lazy";
import { Logger } from "@/lib/logger";
import * as spitroast from "spitroast";
import { debounce, findInReactTree, findInTree } from "@/lib/utils";
import * as metro from "@/metro";
import * as common from "@/metro/common";
import { fromPredicate } from "@/metro/filters";
import { LegacyButton } from "@/ui/CompatComponents";
import { Forms } from "@/ui/components";
import { constantsWithColors, semanticColors } from "@/ui/color";
import { createThemedStyleSheet } from "@/ui/styles";

const logger = new Logger("Enmity");

export interface EnmityPlugin {
    name: string;
    version?: string;
    description?: string;
    authors?: Array<{ name: string; id?: string } | string>;
    onStart(): void;
    onStop(): void;
    getSettingsPanel?(props: { settings: EnmitySettingsStore }): React.ReactNode;
    patches?: Array<{ unpatchAll(): void }>;
    commands?: Command[];
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Patcher: Enmity callbacks receive (thisArg, args, original|result).

type Unpatch = () => void;
const patchesByCaller = new Map<string, Set<Unpatch>>();

function trackPatch(caller: string, unpatch: Unpatch) {
    let set = patchesByCaller.get(caller);
    if (!set) patchesByCaller.set(caller, set = new Set());
    const wrapped = () => {
        set!.delete(wrapped);
        unpatch();
    };
    set.add(wrapped);
    return wrapped;
}

/** Runs a plugin callback; if it throws, logs and returns `fallback()` so Discord keeps working. */
function safely<T>(caller: string, method: string, run: () => T, fallback: () => T): T {
    try {
        return run();
    } catch (e) {
        logger.error(`${caller}: patch on "${method}" threw`, e);
        return fallback();
    }
}

const patcher = {
    before(caller: string, lazyModule: any, method: string, callback: (self: any, args: any[], original: any) => any, once = false) {
        const module = unwrapLazy(lazyModule);
        // A real before-hook, so it runs ahead of other plugins' instead-hooks; args are edited in place
        // (or a new array is returned).
        return trackPatch(caller, spitroast.before(method as never, module, function (this: any, args: any[]) {
            const replaced = safely(caller, method, () => callback(this, args, undefined), () => undefined);
            return Array.isArray(replaced) ? replaced : undefined;
        } as never, once));
    },
    instead(caller: string, lazyModule: any, method: string, callback: (self: any, args: any[], original: any) => any, once = false) {
        const module = unwrapLazy(lazyModule);
        return trackPatch(caller, spitroast.instead(method as never, module, function (this: any, args: any[], original: any) {
            return safely(caller, method, () => callback(this, args, original.bind(this)), () => original.apply(this, args));
        } as never, once));
    },
    after(caller: string, lazyModule: any, method: string, callback: (self: any, args: any[], result: any) => any, once = false) {
        const module = unwrapLazy(lazyModule);
        return trackPatch(caller, spitroast.instead(method as never, module, function (this: any, args: any[], original: any) {
            const result = original.apply(this, args);
            const replaced = safely(caller, method, () => callback(this, args, result), () => undefined);
            return replaced === undefined ? result : replaced;
        } as never, once));
    },
    unpatchAll(caller: string) {
        for (const unpatch of [...patchesByCaller.get(caller) ?? []]) unpatch();
    },
    getPatchesByCaller: (caller: string) => [...patchesByCaller.get(caller) ?? []],
    create(name: string) {
        return {
            before: (module: any, method: string, callback: any, once?: boolean) => patcher.before(name, module, method, callback, once),
            instead: (module: any, method: string, callback: any, once?: boolean) => patcher.instead(name, module, method, callback, once),
            after: (module: any, method: string, callback: any, once?: boolean) => patcher.after(name, module, method, callback, once),
            unpatchAll: () => patcher.unpatchAll(name),
            getPatchesByCaller: () => patcher.getPatchesByCaller(name),
        };
    },
};

// ---------------------------------------------------------------------------
// Metro: getByProps(...props, { all, defaultExport }) style lookups.

type EnmityFindOptions = { all?: boolean; defaultExport?: boolean; default?: boolean };

/** Enmity spelled the option both `defaultExport` and `default`. */
const normalizeOptions = (options: EnmityFindOptions = {}): EnmityFindOptions =>
    ({ ...options, defaultExport: options.defaultExport ?? options.default });

function splitOptions(args: any[]): [any[], EnmityFindOptions] {
    const last = args[args.length - 1];
    return last && typeof last === "object" && !Array.isArray(last) ? [args.slice(0, -1), normalizeOptions(last)] : [args, {}];
}

function getModule(filter: (m: any) => boolean, options: EnmityFindOptions = {}) {
    const { all = false, defaultExport = true } = normalizeOptions(options);
    const wrapped = fromPredicate(filter, "");
    return all ? metro.findAll(wrapped, { raw: !defaultExport }) : metro.find(wrapped, { raw: !defaultExport });
}

const byKey = (filterFactory: (...args: any[]) => metro.Filter) => (...args: any[]) => {
    const [values, options] = splitOptions(args);
    const filter = filterFactory(...values);
    const raw = options.defaultExport === false;
    return options.all ? metro.findAll(filter, { raw }) : metro.find(filter, { raw });
};

const byName = (one: (name: string, expDefault?: boolean) => any, all: (name: string, expDefault?: boolean) => any[]) =>
    (name: string, rawOptions: EnmityFindOptions = {}) => {
        const options = normalizeOptions(rawOptions);
        return options.all ? all(name, options.defaultExport !== false) : one(name, options.defaultExport !== false);
    };

/** Name of the Enmity plugin being loaded, to attribute lookup misses to. */
let lookupOwner: string | null = null;
const reportedMisses = new Set<string>();

/** Attributes the lookups made while `run` executes to `owner` (an Enmity plugin's name). */
export function withLookupOwner<T>(owner: string, run: () => T): T {
    const previous = lookupOwner;
    lookupOwner = owner;
    try {
        return run();
    } finally {
        lookupOwner = previous;
    }
}

/** Warns once per distinct lookup that finds nothing, so plugins broken by Discord updates are easy to diagnose. */
function logMisses<T extends (...args: any[]) => any>(name: string, lookup: T): T {
    return ((...args: any[]) => {
        const result = lookup(...args);
        if (result == null || (Array.isArray(result) && result.length === 0)) {
            const shown = args.filter(arg => typeof arg !== "object" || Array.isArray(arg)).map(arg => typeof arg === "function" ? "<filter>" : JSON.stringify(arg)).join(", ");
            const key = `${lookupOwner ?? "?"}:${name}(${shown})`;
            if (!reportedMisses.has(key)) {
                reportedMisses.add(key);
                new Logger(lookupOwner ?? "Enmity plugin").warn(`Lookup found nothing: ${name}(${shown})`);
            }
        }
        return result;
    }) as T;
}

const modules = {
    getModule: logMisses("getModule", getModule),
    getModules: (filter: (m: any) => boolean) => getModule(filter, { all: true }),
    bulk: (...filters: Array<(m: any) => boolean>) => filters.map(filter => modules.getModule(filter)),
    getByProps: logMisses("getByProps", (...args: any[]) => {
        const [props, options] = splitOptions(args);
        // The common case goes through findByProps, which prefers Discord's design components.
        if (!options.all && options.defaultExport !== false) {
            // getByProps("View") meant React Native itself; Animated also exports View/Text/... now.
            const RN_EXPORTS = ["View", "Text", "ScrollView", "FlatList", "Image", "Pressable", "StyleSheet"];
            const lookup = props.length === 1 && RN_EXPORTS.includes(props[0]) ? [...props, "AppRegistry"] : props;
            const found = metro.findByProps(...lookup);
            // `const { default: Button } = getByProps("ButtonColors", "ButtonSizes")`: that module had
            // the old Button as its default export; the design index has neither.
            if (found && props.includes("ButtonColors") && found.default === undefined) return { ...found, default: LegacyButton };
            return found;
        }
        return byKey(metro.byProps)(...args);
    }),
    // Name lookups go through Distra's finders, which fall back to source file names
    // for Discord's minified component names.
    getByDisplayName: logMisses("getByDisplayName", byName(metro.findByDisplayName, metro.findByDisplayNameAll)),
    getByTypeName: logMisses("getByTypeName", byName(metro.findByTypeName, metro.findByTypeNameAll)),
    getByName: logMisses("getByName", byName(metro.findByName, metro.findByNameAll)),
    getByKeyword: (keyword: string, options?: EnmityFindOptions) =>
        getModule(m => Object.keys(m).some(key => key.toLowerCase().includes(keyword.toLowerCase())), options),
    filters: {
        byProps: (...props: string[]) => (m: any) => props.every(prop => m?.[prop] !== undefined),
        byName: (name: string) => (m: any) => m?.name === name,
        byDisplayName: (name: string) => (m: any) => m?.displayName === name,
        byTypeName: (name: string) => (m: any) => m?.type?.name === name,
    },
    common: {
        React: common.React,
        ReactNative: common.ReactNative,
        Dispatcher: common.FluxDispatcher,
        Flux: common.Flux,
        Navigation: common.navigation,
        NavigationNative: common.NavigationNative,
        NavigationStack: common.navigationStack,
        Toasts: common.toasts,
        Clipboard: common.clipboard,
        Constants: constantsWithColors,
        Assets: common.assetsRegistry,
        Users: common.UserStore,
        Theme: common.ThemeStore,
        Locale: common.i18n,
        Messages: metro.findByPropsLazy("receiveMessage", "sendMessage"),
        Linking: proxyLazy(() => common.ReactNative.Linking),
        // Discord's StyleSheet carried ThemeColorMap (the semantic colors) in Enmity's day.
        StyleSheet: proxyLazy(() => ({ ...common.ReactNative.StyleSheet, createThemedStyleSheet, ThemeColorMap: semanticColors })),
        Moment: metro.findByPropsLazy("isMoment"),
        // The rest mirror Enmity's own lookups (examples/enmity/src/data/modules.ts).
        Clyde: metro.findByPropsLazy("createBotMessage"),
        Avatars: metro.findByPropsLazy("BOT_AVATARS"),
        Native: proxyLazy(() => metro.findByProps("NativeModules")?.NativeModules ?? common.ReactNative.NativeModules),
        Storage: metro.findByPropsLazy("getItem"),
        Dialog: metro.findByPropsLazy("show", "openLazy", "close"),
        Token: metro.findByPropsLazy("getToken"),
        REST: metro.findByPropsLazy("getAPIBaseURL"),
        Settings: metro.findByPropsLazy("watchKeys"),
        AsyncUsers: metro.findByPropsLazy("getUser", "fetchProfile"),
        Profiles: metro.findByPropsLazy("showUserProfile"),
        Lodash: metro.findByPropsLazy("debounce", "throttle"),
        Logger: proxyLazy(() => metro.findByName("Logger")),
        SVG: metro.findByPropsLazy("Svg"),
        Scenes: proxyLazy(() => metro.findByName("getScreens", false)),
        ColorMap: proxyLazy(() => {
            const tokens = common.tokens;
            return Object.assign(Object.create(tokens), { meta: tokens.internal ?? tokens.meta, ThemeColorMap: tokens.colors });
        }),
        Components: proxyLazy(() => ({ Forms, General: common.ReactNative })),
    },
};

// ---------------------------------------------------------------------------
// Settings: synchronous get/set per "file" (usually the plugin name), persisted as one JSON file.

const SETTINGS_PATH = "compat/enmity-settings.json";
let settingsData: Record<string, Record<string, unknown>> = {};
const settingsListeners = new Map<string, Set<(change: { setting: string; value: unknown }) => void>>();
const persistSettings = debounce(() => writeJSON(SETTINGS_PATH, settingsData).catch(() => { }), 250);

export async function loadEnmitySettings() {
    settingsData = await readJSON<typeof settingsData>(SETTINGS_PATH).catch(() => null) ?? {};
}

const settings = {
    get: (file: string, setting: string, defaults?: unknown) => settingsData[file]?.[setting] ?? defaults,
    getBoolean: (file: string, setting: string, defaults: boolean) => Boolean(settings.get(file, setting, defaults)),
    set(file: string, setting: string, value: unknown) {
        (settingsData[file] ??= {})[setting] = value;
        persistSettings();
        settingsListeners.get(file)?.forEach(listener => listener({ setting, value }));
    },
    toggle: (file: string, setting: string, defaults: boolean) => settings.set(file, setting, !settings.getBoolean(file, setting, defaults)),
    subscribe(file: string, callback: (change: { setting: string; value: unknown }) => void) {
        let set = settingsListeners.get(file);
        if (!set) settingsListeners.set(file, set = new Set());
        set.add(callback);
        return () => void set!.delete(callback);
    },
    unsubscribe(file: string, callback: (change: { setting: string; value: unknown }) => void) {
        settingsListeners.get(file)?.delete(callback);
    },
    makeStore: (file: string) => makeSettingsStore(file),
    /** Wraps a component so it re-renders on setting changes and receives a `settings` store prop. */
    connectComponent(component: React.ComponentType<any>, file: string) {
        const Connected = (props: any) => {
            const [, forceUpdate] = common.React.useReducer((n: number) => n + 1, 0);
            common.React.useEffect(() => settings.subscribe(file, forceUpdate), []);
            return common.React.createElement(component, { ...props, settings: makeSettingsStore(file) });
        };
        Connected.displayName = `Connected${component.displayName ?? component.name ?? ""}`;
        return Connected;
    },
    connectStores: (component: React.ComponentType<any>, file: string) => settings.connectComponent(component, file),
};

export type EnmitySettingsStore = ReturnType<typeof makeSettingsStore>;

function makeSettingsStore(file: string) {
    return {
        get: (setting: string, defaults?: unknown) => settings.get(file, setting, defaults),
        getBoolean: (setting: string, defaults: boolean) => settings.getBoolean(file, setting, defaults),
        set: (setting: string, value: unknown) => settings.set(file, setting, value),
        toggle: (setting: string, defaults: boolean) => settings.toggle(file, setting, defaults),
    };
}

// ---------------------------------------------------------------------------
// Plugin registration. The flavor adapter sets a receiver while evaluating a plugin file.

const registered = new Map<string, EnmityPlugin>();
let registrationReceiver: ((plugin: EnmityPlugin) => void) | null = null;

export function captureRegistrations(receiver: (plugin: EnmityPlugin) => void) {
    registrationReceiver = receiver;
    return () => void (registrationReceiver = null);
}

const plugins = {
    registerPlugin(plugin: EnmityPlugin) {
        if (!plugin || typeof plugin !== "object") return;
        registered.set(plugin.name, plugin);
        if (registrationReceiver) registrationReceiver(plugin);
        else logger.warn(`${plugin.name} registered outside of the plugin loader; ignoring`);
    },
    getPlugin: (name: string) => registered.get(name),
    getPlugins: () => [...registered.values()],
    getEnabledPlugins: () => [...registered.keys()],
    getDisabledPlugins: () => [] as string[],
};

const commandUnregisters = new Map<string, Array<() => void>>();

const commands = {
    registerCommands(caller: string, list: Command[]) {
        commandUnregisters.set(caller, list.map(registerCommand));
    },
    unregisterCommands(caller: string) {
        commandUnregisters.get(caller)?.forEach(unregister => unregister());
        commandUnregisters.delete(caller);
    },
    ApplicationCommandType: { Chat: 1, User: 2, Message: 3 },
    ApplicationCommandInputType: { BuiltIn: 0, BuiltInText: 1, BuiltInIntegration: 2, Bot: 3, Placeholder: 4 },
    ApplicationCommandOptionType: {
        SubCommand: 1, SubCommandGroup: 2, String: 3, Integer: 4, Boolean: 5, User: 6,
        Channel: 7, Role: 8, Mentionable: 9, Number: 10, Attachment: 11,
    },
};

// Enmity's components module re-exported RN primitives and Discord's legacy Forms.
const components = new Proxy({}, {
    get(_, key: string) {
        try {
            const form = (Forms as any)[key];
            if (form !== undefined) return form;
        } catch { }
        return (common.ReactNative as any)[key];
    },
});

export function createEnmityObject(flavorName = "Enmity") {
    return {
        version: `distra-${DISTRA_VERSION}`,
        modules,
        patcher,
        plugins,
        settings,
        commands,
        components,
        utilities: {
            findInReactTree,
            findInTree,
            debounce,
            sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
            uuid: () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
            }),
            memoize: <T>(factory: () => T) => {
                let cached: { value: T } | undefined;
                return () => (cached ??= { value: factory() }).value;
            },
            wrapInHooks: (component: (...args: any[]) => any) => (...args: any[]) => component(...args),
            createStore: <T extends object>(initial: T) => {
                const listeners = new Set<() => void>();
                let state = initial;
                return {
                    get: () => state,
                    set(next: Partial<T>) {
                        state = { ...state, ...next };
                        listeners.forEach(listener => listener());
                    },
                    subscribe(listener: () => void) {
                        listeners.add(listener);
                        return () => void listeners.delete(listener);
                    },
                };
            },
        },
        assets: {
            find: (filter: (asset: any) => boolean) => {
                for (let id = 1; ; id++) {
                    const asset = getAssetById(id);
                    if (!asset) return undefined;
                    if (filter(asset)) return { ...asset, id };
                }
            },
            getIDByName: findAssetId,
            getByName: (name: string) => {
                const id = findAssetId(name);
                return id === undefined ? undefined : { ...getAssetById(id), id };
            },
            getByID: getAssetById,
        },
        native: { reload: reloadApp },
        themer: {},
        clyde: {
            // Enmity's sendReply took text or `{ embeds, components }`; both are shown only to you.
            sendReply: (channelId: string, content: unknown) => void sendLocalMessage(channelId, content),
        },
        logger: new Logger(flavorName),
    };
}

declare global {
    // eslint-disable-next-line no-var
    var enmity: ReturnType<typeof createEnmityObject> | undefined;
    // eslint-disable-next-line no-var
    var aliucord: ReturnType<typeof createEnmityObject> | undefined;
}

export function installEnmityGlobals() {
    globalThis.enmity = createEnmityObject("Enmity");
    globalThis.aliucord = createEnmityObject("Aliucord");
}

export { makeSettingsStore, patcher as enmityPatcher, commands as enmityCommands };
