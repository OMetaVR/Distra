// Installs, persists and runs plugins of every supported flavor. Flavor
// specifics (manifest format, how code is evaluated, which API object it gets)
// live in ./flavors; this file only deals with records and lifecycle.

import { callNative } from "@/core/bridge";
import { isSafeMode } from "@/core/loader";
import { readFile, removeFile, writeFile } from "@/core/fs";
import { createFileStorage, createProxy } from "@/core/storage";
import { Logger } from "@/lib/logger";
import { errorToString } from "@/lib/utils";

import { corePlugins, getCorePlugin } from "./core";
import { aliucordFlavor, enmityFlavor } from "./flavors/enmity";
import { bunnyFlavor } from "./flavors/bunny";
import { discordiaFlavor } from "./flavors/discordia";
import { vendettaFlavor } from "./flavors/vendetta";
import { fetchText } from "./fetch";
import { pluginCodePath as codePath, pluginDataPath } from "./paths";
import type { BuiltinInfo, FlavorAdapter, PluginFlavor, PluginInstance, PluginManifest, PluginRecord } from "./types";

const logger = new Logger("Plugins");

export const flavors: Record<PluginFlavor, FlavorAdapter> = {
    discordia: discordiaFlavor,
    vendetta: vendettaFlavor,
    bunny: bunnyFlavor,
    enmity: enmityFlavor,
    aliucord: aliucordFlavor,
};

/** Installed (from URL) plugin records, keyed by id. Persisted and reactive (works with useProxy). */
export let plugins: Record<string, PluginRecord> = createProxy<Record<string, PluginRecord>>({}).proxy;

/**
 * Plugins bundled with Discordia, keyed by id. Metadata comes from the tweak; only
 * the enabled flag is persisted (plugins/builtins.json). Reactive.
 */
export const builtins: Record<string, PluginRecord> = createProxy<Record<string, PluginRecord>>({}).proxy;
let builtinState: Record<string, { enabled: boolean }> = {};

const running = new Map<string, PluginInstance>();

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
    if (manifest.discordia) return "discordia";
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

    try {
        const core = record.builtin?.core ? getCorePlugin(id) : undefined;
        let instance: PluginInstance;
        if (core) {
            await core.start();
            instance = { stop: () => core.stop(), SettingsComponent: core.SettingsComponent };
        } else {
            const code = record.builtin ? await callNative<string>("builtins.code", id) : await readFile(codePath(id));
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
    flavor: PluginFlavor;
    manifest: PluginManifest;
}

async function loadBuiltins() {
    builtinState = await createFileStorage<Record<string, { enabled: boolean }>>("plugins/builtins.json", {});
    for (const core of corePlugins) {
        builtins[core.id] = {
            id: core.id,
            flavor: "discordia",
            manifest: core.manifest,
            enabled: builtinState[core.id]?.enabled ?? false,
            autoUpdate: false,
            builtin: {
                status: "working",
                core: true,
                warning: null,
                upstreamInstallUrl: null,
                source: { repository: "https://github.com/OMetaVR/Discordia", commit: DISCORDIA_COMMIT, license: "Discordia", path: "src/plugins/core", build: "discordia" },
            },
        };
    }
    let index: BuiltinIndexEntry[] = [];
    try {
        index = await callNative<BuiltinIndexEntry[]>("builtins.index");
    } catch (e) {
        logger.error("Could not load the built-in plugin list", e);
    }
    for (const entry of index) {
        builtins[entry.id] = {
            id: entry.id,
            flavor: entry.flavor,
            manifest: entry.manifest,
            enabled: builtinState[entry.id]?.enabled ?? false,
            autoUpdate: false,
            builtin: { status: entry.status, warning: entry.warning, upstreamInstallUrl: entry.upstreamInstallUrl, source: entry.source },
        };
    }
    logger.info(`${index.length} built-in plugins available, ${Object.values(builtins).filter(p => p.enabled).length} enabled`);
}

/** Loads records, updates plugins that allow it, and starts enabled ones. */
export async function initPlugins() {
    plugins = await createFileStorage<Record<string, PluginRecord>>("plugins/index.json", {});
    await loadBuiltins();
    if (isSafeMode()) {
        logger.warn("Safe mode is active; plugins will not be started");
        return;
    }

    const enabled = [...Object.values(plugins), ...Object.values(builtins)].filter(p => p.enabled);
    await Promise.allSettled(enabled.map(async record => {
        if (record.autoUpdate && !record.builtin) {
            await updatePlugin(record.id).catch(e => logger.warn(`Update check failed for ${record.manifest.name}`, e));
        }
        await startPlugin(record.id).catch(() => { });
    }));
}

export async function stopAllPlugins() {
    await Promise.allSettled([...running.keys()].map(stopPlugin));
}
