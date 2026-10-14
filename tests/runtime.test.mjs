// Run with `pnpm test` after `pnpm build`.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

import { boot, createNative, until } from "./harness.mjs";

const ready = ctx => ctx.context.distra != null;
const started = ctx => ctx.events.some(([name]) => name === "runApplication");

test("holds runApplication until Distra has initialized, then replays it once", async () => {
    const ctx = boot();

    assert.ok(ctx.events.some(([name]) => name === "entry-ran"), "entry module runs synchronously");
    assert.equal(started(ctx), false, "UI start is held during init");

    await until(() => started(ctx));
    assert.ok(ready(ctx), "initialized before the UI starts");
    assert.equal(ctx.events.filter(([name]) => name === "runApplication").length, 1);
    assert.equal(ctx.events.some(([name]) => name === "alert"), false, "no init failure alert");
});

test("captures the Metro registry and finds modules", async () => {
    const ctx = boot();
    await until(() => ready(ctx));

    const { metro } = ctx.context.distra;
    assert.ok(Object.keys(ctx.context.modules).length >= 10);
    assert.equal(typeof metro.findByProps("createList").createList, "function");
    assert.equal(metro.findByProps("doesNotExist"), undefined, "missing modules return undefined, even with a throwing module present");
});

test("injects the Distra section into settings", async () => {
    const ctx = boot();
    await until(() => ready(ctx));

    const { metro } = ctx.context.distra;
    const config = metro.findByProps("SETTING_RENDERER_CONFIG").SETTING_RENDERER_CONFIG;
    assert.ok(config.ACCOUNT, "Discord's own rows are preserved");
    assert.ok(config.DISTRA && config.DISTRA_PLUGINS, "Distra rows are added");
    assert.ok(config.DISTRA_CUSTOM_PAGE && config.VendettaCustomPage, "page routes are added");
    assert.equal(config.DISTRA.useTitle(), "Distra");

    const sections = [{ label: "User Settings", settings: ["ACCOUNT"] }, { label: "App Settings", settings: ["APPEARANCE"] }];
    metro.findByProps("createList").createList({ sections });
    assert.equal(sections[1].label, "Distra", "inserted right after the ACCOUNT section");
    assert.ok(sections[1].settings.includes("DISTRA_PLUGINS"));

    // Lists other than the root settings screen are untouched.
    const other = [{ label: "Other", settings: ["X"] }];
    metro.findByProps("createList").createList({ sections: other });
    assert.equal(other.length, 1);
});

test("persists settings through the native bridge", async () => {
    const ctx = boot();
    await until(() => ready(ctx));

    ctx.context.distra.settings.developerSettings = true;
    await until(() => ctx.native.fs.has("settings.json"));
    assert.equal(JSON.parse(ctx.native.fs.get("settings.json")).developerSettings, true);

    ctx.context.distra.loaderConfig.safeMode = true;
    await until(() => ctx.native.state.loaderConfig.safeMode === true);
});

test("marks the launch stable after Distra starts", { timeout: 30_000 }, async () => {
    const ctx = boot();
    await until(() => ctx.native.state.stableMarked, 20_000);
});

test("installs and runs a Vendetta plugin", async () => {
    const base = "https://example.com/plugins/hello/";
    const ctx = boot({
        fetchRoutes: {
            [`${base}manifest.json`]: JSON.stringify({ name: "Hello", description: "Says hi", authors: [{ name: "Tester" }], main: "index.js", hash: "abc" }),
            [`${base}index.js`]: `(function(){
                const unpatch = vendetta.patcher.after("createList", vendetta.metro.findByProps("createList"), () => { globalThis.helloPatched = true; });
                vendetta.plugin.storage.loaded = true;
                return { onLoad() { globalThis.helloLoaded = vendetta.plugin.id; }, onUnload() { unpatch(); globalThis.helloUnloaded = true; } };
            })()`,
        },
    });
    await until(() => ready(ctx));

    const { plugins } = ctx.context.distra;
    const record = await plugins.installPlugin("https://example.com/plugins/hello");
    assert.equal(record.flavor, "vendetta");
    assert.equal(record.enabled, true);
    assert.equal(ctx.context.helloLoaded, base);
    assert.equal(plugins.isRunning(base), true);

    ctx.context.distra.metro.findByProps("createList").createList({ sections: [] });
    assert.equal(ctx.context.helloPatched, true);

    await plugins.disablePlugin(base);
    assert.equal(ctx.context.helloUnloaded, true);
    assert.equal(plugins.isRunning(base), false);

    await plugins.uninstallPlugin(base);
    assert.equal(plugins.plugins[base], undefined);
});

test("installs and runs an Enmity plugin", async () => {
    const url = "https://example.com/Greeter.js";
    const ctx = boot({
        fetchRoutes: {
            [url]: `(() => {
                const Patcher = window.enmity.patcher.create("Greeter");
                window.enmity.plugins.registerPlugin({
                    name: "Greeter",
                    version: "1.0.0",
                    onStart() { globalThis.greeterStarted = true; Patcher.after(window.enmity.modules.getByProps("createList"), "createList", () => { globalThis.greeterPatched = true; }); },
                    onStop() { globalThis.greeterStopped = true; },
                });
            })();`,
        },
    });
    await until(() => ready(ctx));

    const { plugins } = ctx.context.distra;
    const record = await plugins.installPlugin(url);
    assert.equal(record.flavor, "enmity");
    assert.equal(record.manifest.name, "Greeter");
    assert.equal(ctx.context.greeterStarted, true);

    ctx.context.distra.metro.findByProps("createList").createList({ sections: [] });
    assert.equal(ctx.context.greeterPatched, true);

    await plugins.disablePlugin(url);
    assert.equal(ctx.context.greeterStopped, true);
    ctx.context.greeterPatched = false;
    ctx.context.distra.metro.findByProps("createList").createList({ sections: [] });
    assert.equal(ctx.context.greeterPatched, false, "patches are removed on stop");
});

test("records plugin start failures without breaking others", async () => {
    const base = "https://example.com/plugins/broken/";
    const ctx = boot({
        fetchRoutes: {
            [`${base}manifest.json`]: JSON.stringify({ name: "Broken", main: "index.js" }),
            [`${base}index.js`]: `({ onLoad() { throw new Error("kaboom"); } })`,
        },
    });
    await until(() => ready(ctx));

    const { plugins } = ctx.context.distra;
    await plugins.installPlugin(base);
    assert.equal(plugins.plugins[base].enabled, false);
    assert.match(plugins.plugins[base].error, /kaboom/);
});

test("starts enabled plugins on launch, but not in safe mode", async () => {
    const id = "https://example.com/plugins/persisted/";
    const first = boot({
        fetchRoutes: {
            [`${id}manifest.json`]: JSON.stringify({ name: "Persisted", main: "index.js" }),
            [`${id}index.js`]: "({ onLoad() { globalThis.persistedLoaded = true; } })",
        },
    });
    await until(() => ready(first));
    await first.context.distra.plugins.installPlugin(id);
    // Let the debounced index write land, then relaunch with the same Documents folder.
    await until(() => first.native.fs.get("plugins/index.json")?.includes("Persisted"));
    const documents = Object.fromEntries(first.native.fs);

    const relaunched = boot({ native: createNative({ files: documents }) });
    await until(() => relaunched.context.persistedLoaded === true);

    const safe = boot({
        native: createNative({ files: documents }),
        loader: { safeMode: { enabled: true, reason: "crash-loop", failedBoots: 3 } },
    });
    await until(() => started(safe));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(safe.context.persistedLoaded, undefined, "plugins don't run in safe mode");
    assert.equal(safe.context.distra.plugins.plugins[id].enabled, true, "but stay enabled");
});

test("Discord still starts when Distra's init throws", async () => {
    // A malformed loader payload makes init() throw on its first line.
    const ctx = boot({ loader: { discord: null } });
    await until(() => started(ctx));
    assert.ok(ctx.events.some(([name]) => name === "alert"), "the failure is reported");
});

test("Discord still starts when the native bridge is missing", async () => {
    const native = createNative();
    delete native.nativeModuleProxy.FileReaderModule;
    const ctx = boot({ native });
    await until(() => started(ctx));
    assert.ok(ready(ctx), "initializes with in-memory storage");
});

test("redirects bundled assets to the active icon pack", async () => {
    const native = createNative({ files: { "settings.json": JSON.stringify({ iconPack: "Plumpy" }) } });
    const ctx = boot({ native });
    await until(() => ready(ctx));

    const Resolver = ctx.context.__r(12).default;
    const packed = new Resolver(null, null, { name: "ic_home", type: "png", httpServerLocation: "/assets/modules/main_tabs_v2/native/images", scales: [2, 3] });
    assert.equal(packed.defaultAsset().uri, "file:///docs/Distra/IconPacks/Plumpy/modules/main_tabs_v2/native/images/ic_home@3x.png");

    const untouched = new Resolver(null, null, { name: "ic_other", type: "png", httpServerLocation: "/assets/images", scales: [3] });
    assert.equal(untouched.defaultAsset().uri, "bundle://ic_other", "assets missing from the pack fall back to Discord's");
});

test("reports startup status and forwards logs to the tweak", async () => {
    const ctx = boot();
    await until(() => ctx.native.state.jsStatus != null);
    assert.deepEqual([...ctx.native.state.jsStatus.failedSteps], []);
    await until(() => ctx.native.state.jsLogs.some(entry => entry.message.includes("Initialized in")));
    assert.ok(ctx.native.state.jsLogs.some(entry => entry.message.includes("Evaluated before Discord's bundle")), "logs from before timers existed are flushed later");
});

test("lists built-in plugins, disabled by default", async () => {
    const ctx = boot();
    await until(() => ready(ctx) && Object.keys(ctx.context.distra.plugins.builtins).length > 0);
    const { builtins } = ctx.context.distra.plugins;
    assert.ok(Object.keys(builtins).length > 80, "the vendored plugins are listed");
    assert.ok(Object.values(builtins).every(record => record.enabled === false && record.builtin != null));
    assert.ok(Object.values(builtins).some(record => record.flavor === "enmity"));
});

test("enables a built-in plugin and starts it again on the next launch", async () => {
    const id = "vendetta:test/hello";
    const first = boot();
    await until(() => ready(first) && first.context.distra.plugins.builtins[id]);
    await first.context.distra.plugins.enablePlugin(id);
    assert.equal(first.context.helloBuiltin, 1);
    await until(() => first.native.fs.get("plugins/builtins.json")?.includes(id));
    assert.equal(first.native.fs.has("plugins/index.json") && first.native.fs.get("plugins/index.json").includes(id), false, "built-ins aren't stored as installed plugins");

    await assert.rejects(first.context.distra.plugins.uninstallPlugin(id), /can't be uninstalled/);

    const relaunched = boot({ native: createNative({ files: Object.fromEntries(first.native.fs) }) });
    await until(() => relaunched.context.helloBuiltin === 1);
    await relaunched.context.distra.plugins.disablePlugin(id);
    assert.equal(relaunched.context.helloBuiltinStopped, true);
});

test("a real built-in plugin that can't find Discord modules fails cleanly", async () => {
    const ctx = boot();
    await until(() => ready(ctx) && Object.keys(ctx.context.distra.plugins.builtins).length > 1);
    const { plugins } = ctx.context.distra;
    for (const id of ["vendetta:redstonekasi/no-typing", "enmity:colin273/noreplymention"]) {
        if (!plugins.builtins[id]) continue;
        await plugins.enablePlugin(id);
        const record = plugins.builtins[id];
        // In the emulated runtime Discord's modules don't exist, so these either run or record an error.
        assert.ok(plugins.isRunning(id) || (record.enabled === false && typeof record.error === "string"), id);
    }
    assert.ok(started(ctx));
});

// --- Message logger ---------------------------------------------------------

const CHANNEL = "700000000000000001";
const LOGGER = "distra:message-logger";
const msg = (id, content, extra = {}) => ({
    id, channel_id: CHANNEL, content,
    author: { id: "600000000000000001", username: "alice" },
    attachments: [], embeds: [], ...extra,
});

async function bootWithLogger(native = createNative()) {
    const ctx = boot({ native });
    await until(() => ready(ctx) && ctx.context.distra.plugins.builtins[LOGGER]);
    await ctx.context.distra.plugins.enablePlugin(LOGGER);
    assert.equal(ctx.context.distra.plugins.isRunning(LOGGER), true, ctx.context.distra.plugins.builtins[LOGGER].error);
    const dispatcher = ctx.context.__r(18);
    const RowManager = ctx.context.__r(19).default;
    const store = ctx.context.__r(15);
    const row = id => new RowManager().generate({ rowType: 1, message: store.getMessage(CHANNEL, id) });
    return { ctx, dispatcher, store, row };
}

const flatText = nodes => nodes.map(n => typeof n.content === "string" ? n.content : flatText(n.content)).join("");

test("message logger shows edit history above edited messages", async () => {
    const { dispatcher, row } = await bootWithLogger();
    dispatcher.dispatch({ type: "MESSAGE_CREATE", message: msg("1000000000000000001", "hello") });
    dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: msg("1000000000000000001", "hello world", { edited_timestamp: new Date().toISOString() }) });

    const r = row("1000000000000000001");
    assert.equal(r.message.content[0].type, "link", "previous version is colored");
    assert.equal(flatText(r.message.content), "hello\nhello world");
    assert.equal(r.message.content[0].target.linkColor, "color(#8E9297)");
});

test("message logger records your own edits (MESSAGE_END_EDIT)", async () => {
    const { dispatcher, row } = await bootWithLogger();
    dispatcher.dispatch({ type: "MESSAGE_CREATE", message: msg("1000000000000000003", "typo") });
    dispatcher.dispatch({ type: "MESSAGE_END_EDIT", channelId: CHANNEL, response: { ok: true, body: msg("1000000000000000003", "fixed", { edited_timestamp: new Date().toISOString() }) } });
    // The gateway echo has the same content and must not add a second entry.
    dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: msg("1000000000000000003", "fixed", { edited_timestamp: new Date().toISOString() }) });

    const r = row("1000000000000000003");
    assert.equal(flatText(r.message.content), "typo\nfixed");
});

test("message logger keeps deleted messages, in red, and survives a relaunch", async () => {
    const databases = new Map();
    const native = createNative({ databases });
    const { dispatcher, store, row, ctx } = await bootWithLogger(native);

    dispatcher.dispatch({ type: "MESSAGE_CREATE", message: msg("1000000000000000002", "secret", {
        attachments: [{ id: "500000000000000001", filename: "cat.png", url: "https://cdn.discordapp.com/attachments/7/500000000000000001/cat.png?ex=1", content_type: "image/png" }],
    }) });
    dispatcher.dispatch({ type: "MESSAGE_DELETE", id: "1000000000000000002", channelId: CHANNEL });

    assert.ok(store.getMessage(CHANNEL, "1000000000000000002"), "the deleted message stays in the store");
    let r = row("1000000000000000002");
    assert.match(r.message.edited, /^deleted/);
    assert.equal(r.message.content[0].target.linkColor, "color(#F23F43)");
    assert.ok(r.backgroundHighlight.gutterColor);

    // The greyed-out image copy is saved and swapped in.
    await until(() => ctx.context.distra.getLogEntries && row("1000000000000000002").message);
    await new Promise(resolve => setTimeout(resolve, 50));
    const stored = databases.get("messagelogger").prepare("SELECT attachments FROM messages WHERE id = ?").get("1000000000000000002");
    assert.match(stored.attachments, /logger\/images\/500000000000000001\.jpg/);

    // The row is redrawn by briefly changing the content; afterwards it's exactly the original again.
    await until(() => store.getMessage(CHANNEL, "1000000000000000002").content === "secret");
    await new Promise(resolve => setTimeout(resolve, 300));

    // Relaunch: the channel loads from the API without the message; the logger puts it back.
    const second = await bootWithLogger(createNative({ databases, files: Object.fromEntries(native.fs) }));
    second.dispatcher.dispatch({ type: "LOAD_MESSAGES_SUCCESS", channelId: CHANNEL, messages: [msg("1000000000000000003", "later"), msg("1000000000000000001", "earlier")], hasMoreAfter: false });
    assert.ok(second.store.getMessage(CHANNEL, "1000000000000000002"), "re-inserted after relaunch");
    r = second.row("1000000000000000002");
    assert.match(r.message.edited, /^deleted/);
    assert.equal(flatText(r.message.content), "secret");
});

test("message logger respects ignore settings and lets ignored deletes through", async () => {
    const native = createNative({ files: { "plugins/data/core-messagelogger.json": JSON.stringify({ ignoreBots: true }) } });
    const { dispatcher, store } = await bootWithLogger(native);
    const bot = { author: { id: "600000000000000002", username: "bot", bot: true } };

    dispatcher.dispatch({ type: "MESSAGE_CREATE", message: msg("1000000000000000004", "beep", bot) });
    dispatcher.dispatch({ type: "MESSAGE_DELETE", id: "1000000000000000004", channelId: CHANNEL });
    assert.equal(store.getMessage(CHANNEL, "1000000000000000004"), undefined, "ignored bot message is really deleted");

    dispatcher.dispatch({ type: "MESSAGE_CREATE", message: msg("1000000000000000005", "human") });
    dispatcher.dispatch({ type: "MESSAGE_DELETE_BULK", ids: ["1000000000000000005"], channelId: CHANNEL });
    assert.ok(store.getMessage(CHANNEL, "1000000000000000005"), "bulk deletes are logged too");
});

test("name lookups fall back to the module's file name for minified components", async () => {
    const ctx = boot();
    await until(() => ready(ctx));
    const { metro } = ctx.context.distra;
    const card = metro.findByName("UserProfileCard");
    assert.equal(typeof card, "function");
    assert.equal(card.name, "UserProfileCard", "minified names are restored from the file name");
    assert.equal(metro.findByName("UserProfileCard", false).default, card);
    assert.equal(ctx.context.vendetta.metro.findByName("UserProfileCard"), card, "Vendetta plugins get the fallback");
    assert.equal(ctx.context.enmity.modules.getByName("UserProfileCard"), card, "Enmity plugins get the fallback");
    assert.equal(metro.findByName("DefinitelyNotAComponent"), undefined);
});

test("minified design components get their old names back, including static sub-components", async () => {
    const ctx = boot();
    await until(() => ready(ctx));
    const { ActionSheetRow } = ctx.context.distra.metro.findByProps("ActionSheetRow");
    assert.equal(ActionSheetRow.name, "ActionSheetRow");
    assert.equal(ActionSheetRow.Group.name, "ActionSheetRowGroup", "plugins look for type.name === 'ActionSheetRowGroup'");
});

test("old native module names resolve to their TurboModule replacements", async () => {
    const ctx = boot();
    await until(() => ready(ctx));
    const NativeModules = ctx.context.nativeModuleProxy;
    assert.equal(typeof NativeModules.MediaManager.downloadMediaAsset, "function");
    assert.equal(NativeModules.InfoDictionaryManager.Build, "113691", "constants are read from getConstants()");
    assert.equal(NativeModules.FileReaderModule != null, true, "real modules still resolve");
    assert.equal(NativeModules.DefinitelyMissing, undefined);
});

test("patches on DCDChatManager.updateRows see and rewrite chat rows", async () => {
    const ctx = boot();
    await until(() => started(ctx));
    const { vendetta } = ctx.context;
    const DCDChatManager = vendetta.metro.common.ReactNative?.NativeModules?.DCDChatManager ?? ctx.context.nativeModuleProxy.DCDChatManager;
    const unpatch = vendetta.patcher.before("updateRows", DCDChatManager, args => {
        const rows = JSON.parse(args[1]);
        rows[0].message.content = "patched";
        args[1] = JSON.stringify(rows);
    });

    const { Commands } = ctx.context.__r(23);
    Commands.updateRows("view", JSON.stringify([{ type: 1, message: { content: "original" } }]), false);
    const call = ctx.events.findLast(([name]) => name === "updateRows");
    assert.ok(call, "the real command still runs");
    assert.equal(JSON.parse(call[1][1])[0].message.content, "patched");
    unpatch();
});

test("Distra rows stay visible when a plugin wraps SETTING_RENDERER_CONFIG itself", async () => {
    const ctx = boot();
    await until(() => ready(ctx));
    const { metro } = ctx.context.distra;
    const constants = metro.findByProps("SETTING_RENDERER_CONFIG");
    // What Vendetta-era plugins do: capture the current value and spread it on every read.
    const captured = constants.SETTING_RENDERER_CONFIG;
    Object.defineProperty(constants, "SETTING_RENDERER_CONFIG", { configurable: true, get: () => ({ ...captured, PLUGIN_ROW: {} }) });

    ctx.context.distra.settingsUI.registerSection("Late", [{ key: "LATE_ROW", title: () => "Late" }]);
    const config = constants.SETTING_RENDERER_CONFIG;
    assert.ok(config.PLUGIN_ROW && config.DISTRA, "both the plugin's and Distra's rows are present");
    assert.ok(config.LATE_ROW, "rows registered after the plugin wrapped the config still appear");
});

test("the remote debugger runs code from the devtools server and streams logs", async () => {
    const port = 45000 + Math.floor(Math.random() * 1000);
    const server = spawn(process.execPath, ["scripts/devtools.mjs"], {
        env: { ...process.env, DEVTOOLS_PORT: String(port), DEVTOOLS_TOKEN: "testtoken" },
        stdio: ["ignore", "pipe", "inherit"],
    });
    try {
        await new Promise(resolve => server.stdout.on("data", chunk => String(chunk).includes("listening") && resolve()));
        const native = createNative();
        const ctx = boot({
            native,
            fetch,
            loader: { config: { ...native.state.loaderConfig, remoteDebugger: { enabled: true, url: `http://127.0.0.1:${port}/?token=testtoken` } } },
        });
        await until(() => ready(ctx));
        const evaluate = async code => (await fetch(`http://127.0.0.1:${port}/eval`, {
            method: "POST",
            body: JSON.stringify({ code, timeout: 10_000 }),
        })).json();

        assert.deepEqual((await evaluate("1 + 2")).result, 3);
        assert.equal((await evaluate("const a = 2; return a * 3")).result, 6, "statement bodies work");
        assert.equal((await evaluate("Promise.resolve(typeof distra.metro.findByProps)")).result, "function", "promises are awaited");
        const failed = await evaluate("throw new Error('boom')");
        assert.equal(failed.ok, false);
        assert.equal(failed.result.error, "boom");
        assert.equal(typeof (await evaluate("dt.tree()")).result, "string");

        // Logs are sent in batches every 500ms.
        let logs = [];
        await until(async () => {
            ({ logs } = await (await fetch(`http://127.0.0.1:${port}/logs`)).json());
            return logs.some(line => line.tag === "Distra");
        });
        assert.ok(logs.some(line => line.message.includes("device connected")));
        assert.ok(logs.some(line => line.message.includes("[entry]")), "Distra's log reaches the server");

        const rejected = await fetch(`http://127.0.0.1:${port}/poll?token=wrong`);
        assert.equal(rejected.status, 401);
        ctx.context.dt.stop();
    } finally {
        server.kill();
    }
});

test("findByProps prefers Discord's design-system index for design components", async () => {
    const ctx = boot();
    await until(() => ready(ctx));
    ctx.context.__r(25);
    const found = ctx.context.vendetta.metro.findByProps("TableRow");
    assert.equal(typeof found.TableSwitchRow, "function", "plugins destructure TableSwitchRow/TableRowGroup from the same lookup");
    assert.equal(ctx.context.enmity.modules.getByProps("TableRow"), found);
});
