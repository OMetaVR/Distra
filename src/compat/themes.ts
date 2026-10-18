// Vendetta's and Bunny's theme APIs on top of Distra's themes, for plugins like Monet Theme and
// Themes+. Theme records look like theirs: `{ id, selected, data }` with `data` the theme file.
// Themes applied by plugins (Bunny's `selectTheme({ id, data })`) aren't listed in `themes` or
// returned by `getCurrentTheme`, matching Bunny, but are what `getThemeFromLoader` reports.

import { useProxy } from "@/core/storage";
import * as storage from "@/core/storage";
import {
    applyPluginTheme,
    getSelectedTheme,
    type InstalledTheme,
    installFromUrl,
    removeTheme as remove,
    selectTheme as select,
    themeState,
    updateThemes,
} from "@/lib/themes";

const record = (theme: InstalledTheme) => ({ id: theme.url ?? theme.id, selected: themeState.selected === theme.id, data: theme.manifest });

/** Accepts a theme's url (Vendetta ids are urls) or Distra's own id. */
const idOf = (id: string) => Object.values(themeState.installed).find(theme => theme.url === id || theme.id === id)?.id;

function listed() {
    return Object.fromEntries(Object.values(themeState.installed)
        .filter(theme => theme.source !== "plugin")
        .map(theme => [theme.url ?? theme.id, record(theme)]));
}

function themesView() {
    const emitter = new storage.Emitter();
    return new Proxy({}, {
        get: (_, key) => key === storage.vendettaEmitterSymbol ? emitter : listed()[key as string],
        has: (_, key) => key in listed(),
        ownKeys: () => Reflect.ownKeys(listed()),
        getOwnPropertyDescriptor: (_, key) => {
            const value = listed()[key as string];
            return value === undefined ? undefined : { value, writable: false, enumerable: true, configurable: true };
        },
    });
}

function selectAny(theme: unknown) {
    if (theme == null || theme === "default") return select(null);
    if (typeof theme === "string") {
        const id = idOf(theme);
        if (!id) throw new Error(`Theme ${theme} isn't installed`);
        return select(id);
    }
    const value = theme as { id?: string; data?: unknown };
    const installed = value.id ? idOf(value.id) : undefined;
    if (installed && !value.data) return select(installed);
    if (!value.data) throw new Error("selectTheme needs a theme id or { id, data }");
    applyPluginTheme(value.id ?? "plugin", value.data);
}

export function createThemesApi() {
    const themes = themesView();
    return {
        themes,
        installTheme: async (url: string) => void await installFromUrl(url),
        removeTheme: async (id: string) => {
            const target = idOf(id);
            if (!target) return false;
            const wasSelected = themeState.selected === target;
            remove(target);
            return wasSelected;
        },
        selectTheme: async (theme: unknown) => selectAny(theme),
        applyTheme: (theme: unknown) => selectAny(theme && typeof theme === "object" && "data" in (theme as object) ? theme : (theme as any)?.id ?? theme),
        fetchTheme: async (id: string, selected = false) => {
            await updateThemes();
            if (selected) selectAny(id);
        },
        updateThemes: async () => void await updateThemes(),
        getCurrentTheme: () => {
            const theme = getSelectedTheme();
            return theme && theme.source !== "plugin" ? record(theme) : null;
        },
        getThemeFromLoader: () => {
            const theme = getSelectedTheme();
            return theme ? { ...record(theme), id: theme.source === "plugin" ? theme.id.slice("plugin:".length) : record(theme).id } : null;
        },
        useThemes: () => (useProxy(themeState), listed()),
    };
}
