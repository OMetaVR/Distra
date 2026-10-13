// Bunny "spec 3" plugins: manifest.json with { spec: 3, main }, code is an IIFE
// assigning `plugin`, evaluated with `bunny` and `definePlugin` in scope.
// Reference: examples/Kettu-github/src/lib/addons/plugins/index.ts
//
// Most plugins advertised as "Bunny plugins" are actually Vendetta plugins and
// are handled by the Vendetta flavor; this covers the native Bunny format.

import { createFileBackend, createStorage } from "@/core/storage";
import { Logger } from "@/lib/logger";

import { createBunnyObject } from "@/compat/bunny";

import { evaluate, fetchJSON, fetchText, resolveUrl } from "../fetch";
import { pluginDataPath } from "../paths";
import type { FlavorAdapter, PluginManifest } from "../types";

interface BunnyPluginInstance {
    start?(): void;
    stop?(): void;
    SettingsComponent?: React.ComponentType<any>;
}

const manifestUrl = (url: string) => /manifest\.json$/i.test(url) ? url : resolveUrl(url, "manifest.json");

export const bunnyFlavor: FlavorAdapter = {
    flavor: "bunny",
    label: "Bunny",

    async fetch(url, previous) {
        const manifestLocation = manifestUrl(url);
        const manifest = await fetchJSON<PluginManifest>(manifestLocation);
        if (previous?.manifest.version && previous.manifest.version === manifest.version) {
            return { manifest, code: undefined };
        }
        const code = await fetchText(resolveUrl(manifestLocation, manifest.main || "index.js"));
        return { manifest, code };
    },

    async start(record, code) {
        const logger = new Logger(record.manifest.name);
        const bunny = {
            ...createBunnyObject(),
            plugin: {
                manifest: record.manifest,
                logger,
                createStorage: () => createStorage(createFileBackend(pluginDataPath(record.id))),
            },
        };

        const factory = evaluate<(bunny: unknown, definePlugin: (p: BunnyPluginInstance) => BunnyPluginInstance) => any>(
            `(bunny,definePlugin)=>{${code};return plugin?.default ?? plugin;}`,
            `bunny-plugin/${record.id}`,
        );
        const instance: BunnyPluginInstance = factory(bunny, p => p) ?? {};

        instance.start?.();
        return {
            stop: () => instance.stop?.(),
            SettingsComponent: instance.SettingsComponent,
        };
    },
};
