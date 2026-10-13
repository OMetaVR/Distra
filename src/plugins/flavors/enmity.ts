// Enmity and Aliucord (iOS) plugins: a single JS file that calls
// `registerPlugin(plugin)` when evaluated. Its id is the file's URL.

import { captureRegistrations, enmityCommands, enmityPatcher, type EnmityPlugin, makeSettingsStore } from "@/compat/enmity";

import { evaluate, fetchText } from "../fetch";
import type { FlavorAdapter, PluginFlavor, PluginManifest } from "../types";

/** Pulls `name`/`description`/`version` out of the source without running it. */
function sniffManifest(url: string, code: string): PluginManifest {
    const field = (key: string) => code.match(new RegExp(`\\b${key}\\s*:\\s*["'\`]([^"'\`]{1,200})["'\`]`))?.[1];
    const fileName = decodeURIComponent(url.split("/").pop() ?? "plugin").replace(/\.js$/i, "");
    return {
        name: field("name") ?? fileName,
        description: field("description"),
        version: field("version"),
    };
}

function createFlavor(flavor: PluginFlavor, label: string): FlavorAdapter {
    return {
        flavor,
        label,

        async fetch(url) {
            const code = await fetchText(url);
            return { manifest: sniffManifest(url, code), code };
        },

        async start(record, code) {
            let plugin: EnmityPlugin | undefined;
            const release = captureRegistrations(registered => void (plugin ??= registered));
            try {
                evaluate(code, `${flavor}-plugin/${record.id}`);
            } finally {
                release();
            }
            if (!plugin) throw new Error("The plugin did not call registerPlugin()");

            const registeredPlugin = plugin;
            registeredPlugin.onStart();
            if (registeredPlugin.commands) enmityCommands.registerCommands(registeredPlugin.name, registeredPlugin.commands);

            const store = makeSettingsStore(registeredPlugin.name);
            return {
                stop() {
                    try {
                        registeredPlugin.onStop();
                    } finally {
                        registeredPlugin.patches?.forEach(patch => patch.unpatchAll());
                        enmityPatcher.unpatchAll(registeredPlugin.name);
                        enmityCommands.unregisterCommands(registeredPlugin.name);
                    }
                },
                SettingsComponent: registeredPlugin.getSettingsPanel
                    ? () => registeredPlugin.getSettingsPanel!({ settings: store }) as any
                    : undefined,
            };
        },
    };
}

export const enmityFlavor = createFlavor("enmity", "Enmity");
export const aliucordFlavor = createFlavor("aliucord", "Aliucord");
