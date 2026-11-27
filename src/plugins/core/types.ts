import type { PluginManifest } from "../types";

/** A first-party plugin compiled into Distra (no eval, full access to Distra internals). */
export interface CorePlugin {
    id: string;
    manifest: PluginManifest;
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    SettingsComponent?: React.ComponentType<any>;
    /** On until the user turns it off (only for plugins that do nothing unless something asks for them). */
    enabledByDefault?: boolean;
    /** Functions other plugins (and devtools) can use, via `distra.plugins.getInstance(id).api`. */
    api?: Record<string, unknown>;
}

export const definePlugin = (plugin: CorePlugin) => plugin;
