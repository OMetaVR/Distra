import type { PluginManifest } from "../types";

/** A first-party plugin compiled into Discordia (no eval, full access to Discordia internals). */
export interface CorePlugin {
    id: string;
    manifest: PluginManifest;
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    SettingsComponent?: React.ComponentType<any>;
}

export const definePlugin = (plugin: CorePlugin) => plugin;
