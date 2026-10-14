// Installs, persists and runs plugins of every supported flavor. Flavor
// specifics (manifest format, how code is evaluated, which API object it gets)
// live in ./flavors; this file only deals with records and lifecycle.

import { callNative } from "@/core/bridge";
import { isSafeMode, loader } from "@/core/loader";
import { reloadApp } from "@/core/native";
import { readFile, removeFile, writeFile } from "@/core/fs";
import { createFileStorage, createProxy, type StorageEvent, subscribe } from "@/core/storage";
import { Logger } from "@/lib/logger";
import { errorToString } from "@/lib/utils";

import { corePlugins, getCorePlugin } from "./core";
import { aliucordFlavor, enmityFlavor } from "./flavors/enmity";
import { bunnyFlavor } from "./flavors/bunny";
import { distraFlavor } from "./flavors/distra";
import { vendettaFlavor } from "./flavors/vendetta";
import { fetchText } from "./fetch";
import { pluginCodePath as codePath, pluginDataPath } from "./paths";
import type { BuiltinInfo, FlavorAdapter, PluginFlavor, PluginInstance, PluginManifest, PluginRecord } from "./types";

const logger = new Logger("Plugins");

export const flavors: Record<PluginFlavor, FlavorAdapter> = {
    distra: distraFlavor,
    vendetta: vendettaFlavor,
    bunny: bunnyFlavor,
    enmity: enmityFlavor,
    aliucord: aliucordFlavor,
};

/** Installed (from URL) plugin records, keyed by id. Persisted and reactive (works with useProxy). */
export let plugins: Record<string, PluginRecord> = createProxy<Record<string, PluginRecord>>({}).proxy;

/**
 * Plugins bundled with Distra, keyed by id. Metadata comes from the tweak; only
 * the enabled flag is persisted (plugins/builtins.json). Reactive.
 */
export const builtins: Record<string, PluginRecord> = createProxy<Record<string, PluginRecord>>({}).proxy;
let builtinState: Record<string, { enabled: boolean }> = {};

const running = new Map<string, PluginInstance>();

const changeListeners = new Set<(event: StorageEvent) => void>();
/** Calls `listener` whenever an installed or built-in plugin record changes (install, enable, ...). */
export const onPluginsChanged = (listener: (event: StorageEvent) => void) => (changeListeners.add(listener), () => void changeListeners.delete(listener));
const forwardChanges = (event: StorageEvent) => changeListeners.forEach(listener => listener(event));
subscribe(builtins, forwardChanges);

/** Any plugin record, installed or built-in. */
export const getRecord = (id: string): PluginRecord | undefined => plugins[id] ?? builtins[id];

export const isRunning = (id: string) => running.has(id);
export const getInstance = (id: string) => running.get(id);

export function normalizeUrl(url: string) {
    const trimmed = url.trim();
    // Directory-style (polymanifest) URLs are stored with a trailing slash.
    return /\.(js|json)$/i.test(trimmed) || trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/**
 * Guesses a plugin's flavor from its URL and manifest:
 * single .js files are Enmity/Aliucord style, manifests are inspected for spec markers.
 */
export async function detectFlavor(url: string): Promise<PluginFlavor> {
    if (/\.js$/i.test(url)) return "enmity";

    const manifestUrl = /manifest\.json$/i.test(url) ? url : `${normalizeUrl(url)}manifest.json`;
    const manifest = JSON.parse(await fetchText(manifestUrl));
    if (manifest.distra) return "distra";
    if (manifest.spec === 3 || manifest.type === "plugin") return "bunny";
    return "vendetta";
}

async function fetchAndStore(id: string, flavor: PluginFlavor, previous?: PluginRecord) {
    const { manifest, code } = await flavors[flavor].fetch(id, previous);
    if (code === undefined && !previous) throw new Error("Plugin code could not be downloaded");
    if (code !== undefined) await writeFile(codePath(id), code);
    return manifest;
}

export async function installPlugin(url: string, flavor?: PluginFlavor, enable = true) {
    const id = normalizeUrl(url);
    if (plugins[id]) throw new Error("This plugin is already installed");

    flavor ??= await detectFlavor(id);
    const manifest = await fetchAndStore(id, flavor);
    plugins[id] = { id, flavor, manifest, enabled: false, autoUpdate: true };
    logger.info(`Installed ${manifest.name} (${flavor})`);

    if (enable) await enablePlugin(id);
    return plugins[id];
}

export async function updatePlugin(id: string) {
    const record = plugins[id];
    if (!record) throw new Error(`Unknown plugin ${id}`);
    record.manifest = await fetchAndStore(id, record.flavor, record);
}

export async function startPlugin(id: string) {
    const record = getRecord(id);
    if (!record || running.has(id)) return;
    if (isSafeMode()) return;

    // A plugin installed from its author that Distra also ships would patch the same things twice
    // (two Server Drawers fighting over the dock), and turning the built-in one off would silently
    // hand over to the installed copy. The built-in one always speaks for the plugin.
    const twin = record.builtin ? undefined : Object.values(builtins).find(other =>
        other.manifest.name.trim().toLowerCase() === record.manifest.name.trim().toLowerCase());
    if (twin) {
        logger.warn(`Not starting ${record.manifest.name} (${id}): Distra ships it built in${twin.enabled ? "" : " (turned off)"}`);
        return;
    }

    try {
        const core = record.builtin?.core ? getCorePlugin(id) : undefined;
        let instance: PluginInstance;
        if (core) {
            await core.start();
            instance = { stop: () => core.stop(), SettingsComponent: core.SettingsComponent };
        } else {
            const code = record.builtin ? await builtinCode(id) : await readFile(codePath(id));
            instance = await flavors[record.flavor].start(record, code);
        }
        running.set(id, instance);
        delete record.error;
    } catch (e) {
        record.error = errorToString(e);
        logger.error(`Failed to start ${record.manifest.name}`, e);
        throw e;
    }
}

export async function stopPlugin(id: string) {
    const instance = running.get(id);
    if (!instance) return;
    running.delete(id);
    try {
        await instance.stop();
    } catch (e) {
        logger.error(`Error while stopping ${getRecord(id)?.manifest.name ?? id}`, e);
    }
}

function setEnabled(record: PluginRecord, enabled: boolean) {
    record.enabled = enabled;
    if (record.builtin) builtinState[record.id] = { enabled };
}

export async function enablePlugin(id: string) {
    const record = getRecord(id);
    if (!record) return;
    setEnabled(record, true);
    await startPlugin(id).catch(() => setEnabled(record, false));
}

/**
 * For plugins that only switch cleanly on a fresh start: saves the new state without starting or
 * stopping anything, then restarts Discord.
 */
export async function setEnabledAndRestart(id: string, enabled: boolean) {
    const record = getRecord(id);
    if (!record) return;
    setEnabled(record, enabled);
    // Storage writes are debounced (250ms); let this one land before the restart.
    await new Promise(resolve => setTimeout(resolve, 600));
    reloadApp();
}

export async function disablePlugin(id: string) {
    const record = getRecord(id);
    if (!record) return;
    setEnabled(record, false);
    await stopPlugin(id);
}

export async function uninstallPlugin(id: string) {
    if (!plugins[id]) throw new Error("Built-in plugins can't be uninstalled; disable them instead");
    await stopPlugin(id);
    delete plugins[id];
    await removeFile(codePath(id)).catch(() => { });
    await removeFile(pluginDataPath(id)).catch(() => { });
}

interface BuiltinIndexEntry extends BuiltinInfo {
    id: string;
    /** Content hash of the built plugin; Vendetta manifests carry one and some plugins display it. */
    hash?: string;
    flavor: PluginFlavor;
    manifest: PluginManifest;
}

let devBuiltinsPromise: Promise<Map<string, BuiltinIndexEntry & { code: string }> | null> | undefined;

/**
 * Development bundles loaded from a custom URL take built-in plugins from the builtins.json
 * next to the bundle (scripts/devtools.mjs serves it), so plugin fixes don't need a new tweak.
 */
function devBuiltins() {
    if (!__DEV__ || loader.bundle.source !== "custom-url") return Promise.resolve(null);
    const url = loader.bundle.version.replace(/[^/]*$/, "builtins.json");
    return devBuiltinsPromise ??= fetchText(url)
        .then(text => {
            const plugins: (BuiltinIndexEntry & { code: string })[] = JSON.parse(text).plugins;
            logger.info(`Using ${plugins.length} built-in plugins from ${url}`);
            // Files built-in plugins load from the repository (builtin-plugins/assets) come from the same server.
            (globalThis as any).__DISTRA_ASSET_BASE__ = url.replace(/[^/]*$/, "assets/");
            return new Map(plugins.map(plugin => [plugin.id, plugin]));
        })
        .catch(e => {
            logger.warn(`Could not load built-in plugins from ${url}; using the tweak's`, e);
            return null;
        });
}

async function builtinCode(id: string) {
    const code = (await devBuiltins())?.get(id)?.code;
    return code ?? callNative<string>("builtins.code", id);
}

async function loadBuiltins() {
    builtinState = await createFileStorage<Record<string, { enabled: boolean }>>("plugins/builtins.json", {});
    // Core plugin ids were "discordia:*" before the rename to Distra.
    for (const key of Object.keys(builtinState)) {
        if (!key.startsWith("discordia:")) continue;
        builtinState[`distra:${key.slice("discordia:".length)}`] ??= builtinState[key];
        delete builtinState[key];
    }
    for (const core of corePlugins) {
        builtins[core.id] = {
            id: core.id,
            flavor: "distra",
            manifest: core.manifest,
            enabled: builtinState[core.id]?.enabled ?? false,
            autoUpdate: false,
            builtin: {
                status: "working",
                core: true,
                warning: null,
                upstreamInstallUrl: null,
                source: { repository: "https://github.com/OMetaVR/Distra", commit: DISTRA_COMMIT, license: "Distra", path: "src/plugins/core", build: "distra" },
            },
        };
    }
    let index: BuiltinIndexEntry[] = [];
    try {
        const dev = await devBuiltins();
        index = dev ? [...dev.values()].map(({ code: _, ...entry }) => entry) : await callNative<BuiltinIndexEntry[]>("builtins.index");
    } catch (e) {
        logger.error("Could not load the built-in plugin list", e);
    }
    for (const entry of index) {
        builtins[entry.id] = {
            id: entry.id,
            flavor: entry.flavor,
            manifest: { ...entry.manifest, hash: entry.manifest.hash ?? entry.hash },
            enabled: builtinState[entry.id]?.enabled ?? false,
            autoUpdate: false,
            builtin: { status: entry.status, warning: entry.warning, upstreamInstallUrl: entry.upstreamInstallUrl, source: entry.source, requiresRestart: entry.requiresRestart ?? false },
        };
    }
    logger.info(`${index.length} built-in plugins available, ${Object.values(builtins).filter(p => p.enabled).length} enabled`);
}

/**
 * Loads records and starts enabled plugins, from the code already on the device. Runs before
 * Discord's UI first renders (as in Vendetta): patches on memo components only reach components
 * mounted after them. Update checks wait for `updatePlugins`, after the UI is up.
 */
export async function initPlugins() {
    plugins = await createFileStorage<Record<string, PluginRecord>>("plugins/index.json", {});
    subscribe(plugins, forwardChanges);
    await loadBuiltins();
    if (isSafeMode()) {
        logger.warn("Safe mode is active; plugins will not be started");
        return;
    }

    const enabled = [...Object.values(plugins), ...Object.values(builtins)].filter(p => p.enabled);
    await Promise.allSettled(enabled.map(record => startPlugin(record.id)));
}

/** Updates installed plugins that allow it, restarting the running ones that changed. */
export async function updatePlugins() {
    if (isSafeMode()) return;
    await Promise.allSettled(Object.values(plugins).filter(p => p.autoUpdate).map(async record => {
        const hash = record.manifest.hash;
        try {
            await updatePlugin(record.id);
        } catch (e) {
            logger.warn(`Update check failed for ${record.manifest.name}`, e);
            return;
        }
        if (record.manifest.hash === hash || !running.has(record.id)) return;
        logger.info(`Updated ${record.manifest.name}; restarting it`);
        await stopPlugin(record.id);
        await startPlugin(record.id);
    }));
}

export async function stopAllPlugins() {
    await Promise.allSettled([...running.keys()].map(stopPlugin));
}
