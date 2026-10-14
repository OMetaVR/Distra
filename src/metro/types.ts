export type ModuleID = number;

export interface ModuleRecord {
    factory?: (...args: any[]) => void;
    dependencyMap?: ModuleID[] | { paths?: unknown };
    hasError: boolean;
    error?: unknown;
    isInitialized: boolean;
    importedAll?: unknown;
    importedDefault?: unknown;
    publicModule: { exports: any };
    /** Recorded by Distra from Discord's `fileFinishedImporting` calls. */
    __filePath?: string;
}

export type ModuleRegistry = Record<ModuleID, ModuleRecord | undefined>;

export type FilterFn = (exports: any, id: ModuleID, defaultCheck: boolean) => boolean;

/** A filter with a stable string key, used for caching lookups across launches. */
export interface Filter extends FilterFn {
    key: string;
}

declare global {
    // Metro's globals, captured by src/entry.ts before Discord's bundle runs.
    // eslint-disable-next-line no-var
    var modules: ModuleRegistry;
    // eslint-disable-next-line no-var
    var __r: ((id: ModuleID) => any) & { importDefault?: unknown; importAll?: unknown };
    // eslint-disable-next-line no-var
    var __d: (...args: any[]) => void;
    // eslint-disable-next-line no-var
    var __c: (() => ModuleRegistry) | undefined;
}
