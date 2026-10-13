// Discordia's own plugin format. Same directory layout as Vendetta's
// polymanifest, with a `discordia` object in the manifest:
//
//   manifest.json  { "name": "...", "main": "index.js", "version": "1.0.0", "discordia": { "spec": 1 } }
//   index.js       an expression (usually an IIFE) evaluating to
//                  definePlugin({ start(api) {}, stop() {}, SettingsComponent })
//
// `api` is scoped to the plugin: patches made through `api.patcher` and
// commands registered through `api.commands` are undone automatically on stop.

import { createFileBackend, createStorage } from "@/core/storage";
import { registerCommand, type Command } from "@/lib/commands";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import * as metro from "@/metro";
import * as common from "@/metro/common";
import * as components from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { evaluate, fetchJSON, fetchText, resolveUrl } from "../fetch";
import { pluginDataPath } from "../paths";
import type { FlavorAdapter, PluginManifest, PluginRecord } from "../types";

export interface DiscordiaPluginDefinition {
    start?(api: DiscordiaPluginApi): void | Promise<void>;
    stop?(): void | Promise<void>;
    SettingsComponent?: React.ComponentType<any>;
}

export type DiscordiaPluginApi = Awaited<ReturnType<typeof createPluginApi>>;

async function createPluginApi(record: PluginRecord) {
    const patcher = createPatcher(record.manifest.name);
    return {
        manifest: record.manifest,
        logger: new Logger(record.manifest.name),
        storage: await createStorage<Record<string, any>>(createFileBackend(pluginDataPath(record.id))),
        patcher,
        metro,
        common,
        components,
        toasts: { showToast },
        commands: {
            register: (command: Command) => {
                const unregister = registerCommand(command);
                patcher.addCleanup(unregister);
                return unregister;
            },
        },
    };
}

export const discordiaFlavor: FlavorAdapter = {
    flavor: "discordia",
    label: "Discordia",

    async fetch(url, previous) {
        const manifest = await fetchJSON<PluginManifest>(resolveUrl(url, "manifest.json"));
        if (previous && manifest.hash && previous.manifest.hash === manifest.hash) return { manifest, code: undefined };
        const code = await fetchText(resolveUrl(url, manifest.main || "index.js"));
        return { manifest, code };
    },

    async start(record, code) {
        const definePlugin = (definition: DiscordiaPluginDefinition) => definition;
        const factory = evaluate<(definePlugin: unknown) => DiscordiaPluginDefinition>(
            `definePlugin=>(${code})`,
            `discordia-plugin/${record.id}`,
        );
        const definition = factory(definePlugin) ?? {};
        const api = await createPluginApi(record);

        try {
            await definition.start?.(api);
        } catch (e) {
            api.patcher.unpatchAll();
            throw e;
        }

        return {
            async stop() {
                try {
                    await definition.stop?.();
                } finally {
                    api.patcher.unpatchAll();
                }
            },
            SettingsComponent: definition.SettingsComponent,
        };
    },
};
