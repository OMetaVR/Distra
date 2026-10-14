// Vendetta plugins (polymanifest): `<url>/manifest.json` + `<url>/<main>`.
// The code is an expression evaluated with a `vendetta` binding in scope and
// returns { onLoad, onUnload, settings }.
// See https://github.com/vendetta-mod/polymanifest

import { createFileBackend, createStorage } from "@/core/storage";
import { Logger } from "@/lib/logger";

import { evaluate, fetchJSON, fetchText, resolveUrl } from "../fetch";
import { pluginDataPath } from "../paths";
import type { FlavorAdapter, PluginManifest } from "../types";

// The old Vendetta proxy domain moved; keep installs from it working.
const PROXY_REWRITES: Array<[string, string]> = [
    ["https://vd-plugins.github.io/proxy/", "https://bn-plugins.github.io/vd-proxy/"],
    ["https://bunny-mod.github.io/plugins-proxy/", "https://bn-plugins.github.io/vd-proxy/"],
];

const rewrite = (url: string) => {
    for (const [from, to] of PROXY_REWRITES) if (url.startsWith(from)) return to + url.slice(from.length);
    return url;
};

/** Lookups whose misses are logged, so plugins broken by Discord updates are easy to diagnose. */
const TRACKED_LOOKUPS = [
    "find", "findAll", "findByProps", "findByPropsAll", "findByName", "findByNameAll",
    "findByDisplayName", "findByDisplayNameAll", "findByTypeName", "findByTypeNameAll", "findByStoreName",
];

const isMiss = (result: unknown) => result == null || (Array.isArray(result) && result.length === 0);

const describeArgs = (args: unknown[]) => args
    .map(arg => typeof arg === "function" ? "<filter>" : JSON.stringify(arg))
    .join(", ");

/** Copies of `api`'s lookup functions that warn once per distinct lookup that finds nothing. */
function withMissLogging<T extends Record<string, any>>(api: T, names: string[], logger: Logger, seen: Set<string>): T {
    const copy: Record<string, any> = { ...api };
    for (const name of names) {
        const original = api[name];
        if (typeof original !== "function") continue;
        copy[name] = (...args: unknown[]) => {
            const result = original(...args);
            if (isMiss(result)) {
                const key = `${name}(${describeArgs(args)})`;
                if (!seen.has(key)) {
                    seen.add(key);
                    logger.warn(`Lookup found nothing: ${key}`);
                }
            }
            return result;
        };
    }
    return copy as T;
}

/**
 * The patcher a plugin gets: Vendetta's before/after/instead, tracked so `unpatchAll` (and
 * stopping the plugin) only removes this plugin's patches.
 */
function pluginPatcher(base: Record<string, any>) {
    const unpatches = new Set<() => void>();
    const track = (kind: "before" | "after" | "instead") => (...args: any[]) => {
        const unpatch = base[kind](...args);
        const tracked = () => {
            unpatches.delete(tracked);
            unpatch?.();
        };
        unpatches.add(tracked);
        return tracked;
    };
    return {
        ...base,
        before: track("before"),
        after: track("after"),
        instead: track("instead"),
        unpatchAll: () => [...unpatches].forEach(unpatch => unpatch()),
    };
}

interface VendettaPluginExports {
    onLoad?(): void;
    onUnload?(): void;
    settings?: React.ComponentType<any>;
}

export const vendettaFlavor: FlavorAdapter = {
    flavor: "vendetta",
    label: "Vendetta",

    async fetch(url, previous) {
        const base = rewrite(url);
        const manifest = await fetchJSON<PluginManifest>(resolveUrl(base, "manifest.json"));
        if (previous && previous.manifest.hash && previous.manifest.hash === manifest.hash) {
            return { manifest, code: undefined };
        }
        const code = await fetchText(resolveUrl(base, manifest.main || "index.js"));
        return { manifest, code };
    },

    async start(record, code) {
        if (!globalThis.vendetta) throw new Error("Vendetta compatibility layer is not loaded");

        const vendetta = globalThis.vendetta;
        const logger = new Logger(record.manifest.name);
        const misses = new Set<string>();
        const patcher = pluginPatcher(vendetta.patcher);
        const pluginApi = {
            ...vendetta,
            patcher,
            metro: withMissLogging(vendetta.metro, TRACKED_LOOKUPS, logger, misses),
            ui: { ...vendetta.ui, assets: withMissLogging(vendetta.ui.assets, ["getAssetIDByName", "getAssetByName"], logger, misses) },
            plugin: {
                id: record.id,
                manifest: record.manifest,
                storage: await createStorage<Record<string, any>>(createFileBackend(pluginDataPath(record.id))),
            },
            logger,
        };

        const factory = evaluate<(vendetta: unknown) => unknown>(`vendetta=>{return ${code}}`, record.id);
        const raw = factory(pluginApi);
        const result = typeof raw === "function" ? raw() : raw;
        const exports: VendettaPluginExports = result?.default ?? result ?? {};

        exports.onLoad?.();
        return {
            stop: () => {
                try {
                    exports.onUnload?.();
                } finally {
                    patcher.unpatchAll();
                }
            },
            SettingsComponent: exports.settings,
        };
    },
};
