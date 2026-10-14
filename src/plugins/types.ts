export type PluginFlavor = "distra" | "vendetta" | "bunny" | "enmity" | "aliucord";

export interface PluginAuthor {
    name: string;
    id?: string;
}

/** Normalized manifest; flavor-specific fields are kept as-is. */
export interface PluginManifest {
    name: string;
    description?: string;
    authors?: PluginAuthor[];
    version?: string;
    /** Entry file, relative to the manifest URL (Vendetta polymanifest / Bunny spec 3). */
    main?: string;
    /** Content hash; Vendetta uses it to skip downloading unchanged code. */
    hash?: string;
    [key: string]: unknown;
}

export interface PluginRecord {
    /** Install URL. Unique; also the id Vendetta-flavored plugins see. */
    id: string;
    flavor: PluginFlavor;
    manifest: PluginManifest;
    enabled: boolean;
    autoUpdate: boolean;
    /** Last error from starting or updating, cleared on success. */
    error?: string;
    /** Set for plugins that ship with Distra (builtin-plugins/). */
    builtin?: BuiltinInfo;
}

export interface BuiltinInfo {
    /** Compatibility as reported by the community plugin list, or "legacy" for Enmity-era plugins. */
    status: "working" | "warning" | "legacy";
    /** First-party plugin compiled into Distra (src/plugins/core). */
    core?: boolean;
    warning: string | null;
    upstreamInstallUrl: string | null;
    source: { repository: string; commit: string; license: string; path: string; build: "source" | "upstream-prebuilt" | "distra" };
}

/** A running plugin. */
export interface PluginInstance {
    stop(): void | Promise<void>;
    SettingsComponent?: React.ComponentType<any>;
}

export interface FetchedPlugin {
    manifest: PluginManifest;
    /** Undefined when the plugin is unchanged since `previous`. */
    code: string | undefined;
}

export interface FlavorAdapter {
    flavor: PluginFlavor;
    label: string;
    fetch(url: string, previous?: PluginRecord): Promise<FetchedPlugin>;
    start(record: PluginRecord, code: string): Promise<PluginInstance>;
}
