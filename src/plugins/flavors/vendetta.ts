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

        const pluginApi = {
            ...globalThis.vendetta,
            plugin: {
                id: record.id,
                manifest: record.manifest,
                storage: await createStorage<Record<string, any>>(createFileBackend(pluginDataPath(record.id))),
            },
            logger: new Logger(record.manifest.name),
        };

        const factory = evaluate<(vendetta: unknown) => unknown>(`vendetta=>{return ${code}}`, record.id);
        const raw = factory(pluginApi);
        const result = typeof raw === "function" ? raw() : raw;
        const exports: VendettaPluginExports = result?.default ?? result ?? {};

        exports.onLoad?.();
        return {
            stop: () => exports.onUnload?.(),
            SettingsComponent: exports.settings,
        };
    },
};
