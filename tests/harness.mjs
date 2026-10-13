// Emulates just enough of Discord's runtime to run dist/discordia.js in Node:
// a Metro module system (`__d`/`__r`/`__c`), a handful of fake Discord modules,
// the bridgeless AppRegistry, and the native side of the Discordia bridge.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Metro's require polyfill, reduced to the parts Discordia touches. */
function installMetro(global) {
    let modules = Object.create(null);

    function define(factory, moduleId, dependencyMap) {
        if (modules[moduleId] != null) return;
        modules[moduleId] = {
            dependencyMap,
            factory,
            hasError: false,
            importedAll: {},
            importedDefault: {},
            isInitialized: false,
            publicModule: { exports: {} },
        };
    }

    function metroRequire(moduleId) {
        const module = modules[moduleId];
        if (!module) throw new Error(`Requiring unknown module "${moduleId}"`);
        if (module.isInitialized) return module.publicModule.exports;
        module.isInitialized = true;
        const { factory, dependencyMap } = module;
        try {
            const moduleObject = module.publicModule;
            factory(global, metroRequire, id => metroRequire(id)?.default, id => metroRequire(id), moduleObject, moduleObject.exports, dependencyMap);
            module.factory = undefined;
            module.dependencyMap = undefined;
            return moduleObject.exports;
        } catch (e) {
            module.hasError = true;
            module.isInitialized = false;
            throw e;
        }
    }

    function clear() {
        modules = Object.create(null);
        return modules;
    }

    // Same assignment order as metro-runtime's require.js.
    global.__r = metroRequire;
    global.__d = define;
    global.__c = clear;
    modules = clear();
}

/** Built-in plugins from the last `pnpm build:plugins`, plus a synthetic one with a known outcome. */
function loadBuiltins() {
    let plugins = [];
    try {
        plugins = JSON.parse(readFileSync(path.join(root, "dist/builtins.json"), "utf8")).plugins;
    } catch { }
    return [...plugins, {
        id: "vendetta:test/hello",
        flavor: "vendetta",
        manifest: { name: "Hello Builtin", description: "Test plugin", authors: [{ name: "Tests" }] },
        status: "working",
        warning: null,
        upstreamInstallUrl: null,
        source: { repository: "https://github.com/test/test", commit: "0000000", license: "CC0-1.0", path: ".", build: "source" },
        code: "({ onLoad() { globalThis.helloBuiltin = (globalThis.helloBuiltin ?? 0) + 1; }, onUnload() { globalThis.helloBuiltinStopped = true; } })",
    }];
}

/** The `db.*` bridge methods from DCDDatabase.m, on real SQLite. Pass `databases` to share them across boots. */
function createDatabases(databases = new Map()) {
    const open = name => {
        if (!databases.has(name)) {
            const handle = new DatabaseSync(":memory:");
            handle.exec("PRAGMA foreign_keys=ON");
            databases.set(name, handle);
        }
        return databases.get(name);
    };
    const toJs = value => typeof value === "bigint" ? (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER) ? value.toString() : Number(value)) : value;
    const run = (handle, sql, params = []) => {
        const statement = handle.prepare(sql);
        statement.setReadBigInts(true);
        const bound = params.map(p => typeof p === "boolean" ? Number(p) : p);
        if (statement.columns().length) {
            statement.setReturnArrays?.(true);
            const rows = statement.all(...bound).map(row => (Array.isArray(row) ? row : Object.values(row)).map(toJs));
            return { columns: statement.columns().map(c => c.name), rows };
        }
        const info = statement.run(...bound);
        return { changes: toJs(info.changes), lastInsertRowId: toJs(info.lastInsertRowid) };
    };
    return {
        databases,
        methods: {
            "db.exec": (name, sql, params) => run(open(name), sql, params),
            "db.batch": (name, statements) => {
                const handle = open(name);
                handle.exec("BEGIN");
                try {
                    const results = statements.map(([sql, params]) => run(handle, sql, params));
                    handle.exec("COMMIT");
                    return results;
                } catch (e) {
                    handle.exec("ROLLBACK");
                    throw e;
                }
            },
            "db.size": () => 4096,
        },
    };
}

/** In-memory Documents/Discordia plus the bridge methods from DCDBridge.m. */
export function createNative({ files = {}, loaderConfig, databases } = {}) {
    const builtins = loadBuiltins();
    const sqlite = createDatabases(databases);
    const fs = new Map(Object.entries(files));
    const calls = [];
    const state = {
        stableMarked: false,
        jsStatus: null,
        jsLogs: [],
        reloads: 0,
        appIcon: null,
        loaderConfig: loaderConfig ?? { customLoadUrl: { enabled: false, url: "" }, safeMode: false },
    };

    const methods = {
        "fs.read": p => {
            if (!fs.has(p)) throw new Error(`No such file: ${p}`);
            return fs.get(p);
        },
        "fs.write": (p, contents) => void fs.set(p, contents),
        "fs.exists": p => fs.has(p),
        "fs.remove": p => void fs.delete(p),
        "fs.list": dir => [...fs.keys()].filter(k => k.startsWith(`${dir}/`)).map(k => k.slice(dir.length + 1)),
        "loader.getConfig": () => state.loaderConfig,
        "loader.setConfig": config => void (state.loaderConfig = config),
        "boot.markStable": () => void (state.stableMarked = true),
        "iconpacks.list": () => [{ id: "Plumpy", name: "Plumpy", source: "documents", path: "/docs/Discordia/IconPacks/Plumpy" }],
        "iconpacks.index": id => ({ path: `/docs/Discordia/IconPacks/${id}`, files: ["modules/main_tabs_v2/native/images/ic_home@3x.png"] }),
        "appicon.list": () => ({ current: state.appIcon, supported: true, icons: [{ name: "DiscordiaIcon", files: [] }] }),
        "appicon.set": name => void (state.appIcon = name),
        "log.write": entries => void state.jsLogs.push(...entries),
        ...sqlite.methods,
        "image.cache": (url, relativePath) => ({ uri: `file:///docs/Discordia/${relativePath}`, width: 100, height: 100, bytes: 1000 }),
        "builtins.index": () => builtins.map(({ code, ...entry }) => entry),
        "builtins.code": id => {
            const plugin = builtins.find(p => p.id === id);
            if (!plugin) throw new Error(`No built-in plugin ${id}`);
            return plugin.code;
        },
        "diag.ready": status => void (state.jsStatus = status),
        "diag.showLogs": () => { },
    };

    const FileReaderModule = {
        async readAsDataURL(payload) {
            const call = payload?.discordia;
            if (!call) throw new Error("not a discordia call");
            calls.push(call.method);
            const handler = methods[call.method];
            if (!handler) return { error: `Unknown method ${call.method}` };
            try {
                return { result: await handler(...call.args) };
            } catch (e) {
                return { error: e.message };
            }
        },
    };

    return {
        fs,
        calls,
        state,
        databases: sqlite.databases,
        nativeModuleProxy: {
            FileReaderModule,
            BundleUpdaterManager: { reload: () => void state.reloads++ },
            // TurboModules under Discord 2xx+ names; constants come from getConstants().
            NativeMediaManagerModule: { downloadMediaAsset: async () => true },
            NativeClientInfoModule: { getConstants: () => ({ Build: "113691", Version: "348.0" }) },
        },
    };
}

/**
 * Fake Discord modules. Ids mimic Metro: 0 is the app entry, which registers
 * AppRegistry (and so defines RN$AppRegistry, as React Native does in bridgeless mode).
 */
function defineDiscordModules(global, events) {
    const d = (id, factory) => global.__d(factory, id, []);

    // A catch-all proxy returning null for any ordinary property name, like one found in
    // Discord 348. It must never be mistaken for the modules Discordia patches.
    d(13, (g, r, _i, _a, module) => {
        module.exports = new Proxy({}, {
            get: (_, key) => typeof key === "string" && !key.startsWith("\u0000") ? null : undefined,
        });
    });

    // InitializeCore-like: runs before the entry module.
    d(1, (g, r, _i, _a, module) => {
        module.exports = { initializeCore: true };
    });

    // React (only what Discordia touches outside of rendering)
    d(2, (g, r, _i, _a, module) => {
        class Component { constructor(props) { this.props = props; } setState() { } }
        module.exports = {
            createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
            useState: v => [v, () => { }],
            useEffect: () => { },
            useReducer: (_, v) => [v, () => { }],
            useCallback: f => f,
            memo: c => c,
            Component,
        };
    });

    // React Native
    d(3, (g, r, _i, _a, module) => {
        module.exports = {
            AppRegistry: {},
            View: "View",
            ScrollView: "ScrollView",
            Alert: { alert: () => { }, prompt: () => { } },
            PixelRatio: { get: () => 3 },
            StyleSheet: { create: s => s, flatten: s => s },
            processColor: hex => `color(${hex})`,
            Linking: { openURL: async () => { } },
        };
    });

    // Settings renderer config + list factory
    d(4, (g, r, _i, _a, module) => {
        module.exports = { SETTING_RENDERER_CONFIG: { ACCOUNT: { type: "route", title: () => "Account" } } };
    });
    d(5, (g, r, _i, _a, module) => {
        module.exports = { createList: config => ({ rendered: config }) };
    });

    // Asset registry
    d(6, (g, r, _i, _a, module) => {
        const assets = [];
        module.exports = {
            registerAsset: asset => assets.push(asset),
            getAssetByID: id => assets[id - 1],
        };
    });
    d(7, (g, r, _i, _a, module) => {
        module.exports = r(6).registerAsset({ name: "PuzzlePieceIcon", type: "png", httpServerLocation: "/assets/design", scales: [2, 3] });
    });

    // Built-in commands
    d(8, (g, r, _i, _a, module) => {
        module.exports = { getBuiltInCommands: () => [{ id: "-1", name: "shrug", type: 1 }] };
    });

    // Navigation
    d(9, (g, r, _i, _a, module) => {
        module.exports = { NavigationContainer: {}, useNavigation: () => ({}), useRoute: () => ({ params: {} }) };
    });
    d(10, (g, r, _i, _a, module) => {
        module.exports = { getRootNavigationRef: () => ({ navigate: (...args) => events.push(["navigate", ...args]) }) };
    });

    // React Native's AssetSourceResolver (ESM default export).
    d(12, (g, r, _i, _a, module) => {
        class AssetSourceResolver {
            constructor(serverUrl, jsbundleUrl, asset) { this.asset = asset; }
            defaultAsset() { return { uri: `bundle://${this.asset.name}`, scale: 1 }; }
            scaledAssetPath() { return this.defaultAsset(); }
        }
        module.exports = { __esModule: true, default: AssetSourceResolver };
    });

    // Stores and dispatcher used by the message logger. The dispatcher applies message
    // events to MessageStore the way Discord's store handlers would.
    d(14, (g, r, _i, _a, module) => {
        const channels = new Map();
        const messageStore = {
            getName: () => "MessageStore",
            getMessage: (channelId, id) => channels.get(channelId)?.get(id),
            getMessages: channelId => [...(channels.get(channelId)?.values() ?? [])],
            _channels: channels,
        };
        const record = raw => ({ ...raw, toJS() { return { ...this }; } });
        const dispatcher = {
            _interceptors: [],
            events: [],
            dispatch(event) {
                this.events.push(event);
                const messages = event.channelId ?? event.message?.channel_id;
                switch (event.type) {
                    case "MESSAGE_CREATE":
                    case "MESSAGE_UPDATE": {
                        const map = channels.get(event.message.channel_id) ?? new Map();
                        channels.set(event.message.channel_id, map);
                        map.set(event.message.id, record({ ...map.get(event.message.id), ...event.message }));
                        break;
                    }
                    case "MESSAGE_DELETE":
                        channels.get(messages)?.delete(event.id);
                        break;
                    case "MESSAGE_DELETE_BULK":
                        for (const id of event.ids) channels.get(messages)?.delete(id);
                        break;
                    case "LOAD_MESSAGES_SUCCESS": {
                        const map = new Map();
                        for (const m of event.messages) map.set(m.id, record(m));
                        channels.set(event.channelId, map);
                        break;
                    }
                }
            },
        };
        module.exports = {
            MessageStore: messageStore,
            ChannelStore: { getName: () => "ChannelStore", getChannel: id => ({ id, guild_id: "900000000000000001" }) },
            UserStore: { getName: () => "UserStore", getCurrentUser: () => ({ id: "800000000000000001" }) },
            FluxDispatcher: dispatcher,
        };
    });
    d(15, (g, r, _i, _a, module) => { module.exports = r(14).MessageStore; });
    d(16, (g, r, _i, _a, module) => { module.exports = r(14).ChannelStore; });
    d(17, (g, r, _i, _a, module) => { module.exports = r(14).UserStore; });
    d(18, (g, r, _i, _a, module) => { module.exports = r(14).FluxDispatcher; });
    // RowManager builds chat rows; generate() output is what the logger decorates.
    d(19, (g, r, _i, _a, module) => {
        function RowManager() { }
        RowManager.prototype.generate = function (data) {
            return { type: 1, message: { id: data.message.id, content: [{ type: "text", content: data.message.content }], edited: data.message.edited_timestamp ? "(edited)" : undefined } };
        };
        module.exports = { __esModule: true, default: RowManager };
    });

    // Discord's import tracker, and a component whose function name was minified to "o".
    d(20, (g, r, _i, _a, module) => { module.exports = { fileFinishedImporting: () => { } }; });
    d(21, (g, r, _i, _a, module) => {
        function o() { return null; }
        module.exports = { __esModule: true, default: o };
        r(20).fileFinishedImporting("modules/user_profile/native/UserProfileCard.tsx");
    });

    // Design component with minified names and static sub-components (ActionSheetRow.Group).
    d(22, (g, r, _i, _a, module) => {
        const row = function () { return null; };
        const group = function () { return null; };
        Object.defineProperty(row, "name", { value: "" });
        Object.defineProperty(group, "name", { value: "" });
        row.Group = group;
        module.exports = { __esModule: true, ActionSheetRow: row };
        r(20).fileFinishedImporting("design/components/Sheet/native/ActionSheetRow.native.tsx");
    });

    // The DCDChat native component; chat rows go through Commands.updateRows(view, rowsJson, ...).
    d(23, (g, r, _i, _a, module) => {
        const Commands = {
            updateRows: (...args) => void events.push(["updateRows", args]),
            clearRows: () => { },
        };
        module.exports = { __esModule: true, default: "DCDChat", __INTERNAL_VIEW_CONFIG: { uiViewClassName: "DCDChat" }, Commands };
    });

    // A module that throws when initialized; finders must survive it.
    d(11, () => {
        throw new Error("broken module");
    });

    // Entry module: imports the app and registers it with AppRegistry.
    d(0, (g, r) => {
        r(13);
        for (const id of [14, 15, 16, 17, 18, 19, 20]) r(id);
        r(2);
        r(3);
        events.push(["entry-ran"]);
        const AppRegistry = {
            runApplication: (name, params) => events.push(["runApplication", name, params]),
        };
        g.RN$AppRegistry = AppRegistry;
    });
}

/**
 * Runs Discordia, then a fake Discord bundle, in a fresh VM context.
 * Returns the context plus recorded events.
 */
export function boot({ native = createNative(), loader = {}, fetchRoutes = {} } = {}) {
    const events = [];
    // Like Hermes before Discord's bundle runs: no console and no timers yet.
    const context = vm.createContext({
        Promise,
        alert: message => events.push(["alert", message]),
        nativeModuleProxy: native.nativeModuleProxy,
        ErrorUtils: { getGlobalHandler: () => () => { }, setGlobalHandler: () => { } },
        fetch: async url => {
            const clean = url.split("?")[0];
            if (!(clean in fetchRoutes)) return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
            return { ok: true, status: 200, text: async () => fetchRoutes[clean] };
        },
        __DISCORDIA_LOADER__: {
            name: "DiscordiaTweak",
            version: "0.1.0",
            platform: "ios",
            jailbroken: false,
            bridge: { module: "FileReaderModule", method: "readAsDataURL", key: "discordia" },
            discord: { version: "348.0", build: "113691", bundleId: "com.hammerandchisel.discord" },
            safeMode: { enabled: false, reason: null, failedBoots: 0 },
            config: native.state.loaderConfig,
            bundle: { source: "embedded", version: "test" },
            ...loader,
        },
    });
    context.globalThis = context;

    // 1. Discordia's bundle, evaluated first like the tweak does.
    vm.runInContext(readFileSync(path.join(root, "dist/discordia.js"), "utf8"), context, { filename: "discordia.js" });

    // 2. Discord's bundle: polyfills, require polyfill, module definitions, then InitializeCore and the entry.
    Object.assign(context, {
        console: { log() { }, info() { }, warn() { }, error() { }, debug() { } },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
    });
    installMetro(context);
    defineDiscordModules(context, events);
    context.__r(1);
    context.__r(0);

    // 3. Native starts the UI as soon as the bundle has been evaluated.
    context.RN$AppRegistry?.runApplication("Discord", { rootTag: 1 });

    return { context, events, native };
}

/** Waits until `predicate()` is truthy. */
export async function until(predicate, timeout = 5000) {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeout) throw new Error("Timed out waiting for condition");
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}
