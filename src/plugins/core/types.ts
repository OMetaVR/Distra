import type { PluginManifest } from "../types";

/** A first-party plugin compiled into Distra (no eval, full access to Distra internals). */
export interface CorePlugin {
    id: string;
    manifest: PluginManifest;
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    SettingsComponent?: React.ComponentType<any>;
}

export const definePlugin = (plugin: CorePlugin) => plugin;
