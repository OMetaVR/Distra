// Themes: installed theme files, the selected one, and the Theme Library. Stored in
// Documents/Distra/themes.json. The selected theme is applied during startup, before Discord's
// first render, so there's no flash of the default colours.

import { isSafeMode } from "@/core/loader";
import { createFileStorage } from "@/core/storage";
import { logger } from "@/lib/logger";
import { findByProps } from "@/metro";

import { patchChatBackground, setBackgroundHidden } from "./background";
import { applyDefinition, getLastDiscordTheme, onDiscordThemeChange, semanticTokens } from "./engine";
import { LIBRARY, type LibraryTheme } from "./library";
import { type BaseTheme, describeTheme, parseTheme, type ThemeInfo } from "./parser";

export type { BaseTheme, ThemeInfo } from "./parser";
export type { LibraryTheme } from "./library";
export { LIBRARY } from "./library";

export interface InstalledTheme {
    id: string;
    /** "plugin": applied by a plugin through the Vendetta/Bunny API (e.g. Monet Theme). */
    source: "url" | "library" | "local" | "plugin";
    url?: string;
    manifest: any;
    installedAt: number;
}

interface ThemeState {
    installed: Record<string, InstalledTheme>;
    selected: string | null;
    /** "auto" follows Discord's own appearance setting. */
    base: "auto" | BaseTheme;
    hideBackground: boolean;
    /** Discord's own theme when a theme was last applied, for "auto" at startup. */
    discordTheme?: BaseTheme;
}

const defaults: ThemeState = { installed: {}, selected: null, base: "auto", hideBackground: false };

export let themeState: ThemeState = defaults;

const libraryId = (id: string) => `library:${id}`;

function baseTheme(): BaseTheme {
    if (themeState.base !== "auto") return themeState.base;
    return themeState.discordTheme ?? getLastDiscordTheme();
}

function definitionFor(theme: InstalledTheme) {
    const ref = findByProps("SemanticColor");
    return parseTheme(theme.manifest, {
        tokens: semanticTokens(),
        rawColor: name => ref?.RawColor?.[name],
        base: baseTheme(),
        explicitBase: themeState.base !== "auto",
    });
}

export function themeInfo(theme: InstalledTheme): ThemeInfo | null {
    try {
        return describeTheme(theme.manifest);
    } catch {
        return null;
    }
}

export const getSelectedTheme = () => themeState.selected ? themeState.installed[themeState.selected] ?? null : null;

function apply({ update = true } = {}) {
    const theme = getSelectedTheme();
    if (!theme) return applyDefinition(null, null, { update });
    const definition = definitionFor(theme);
    applyDefinition(themeInfo(theme)?.name ?? theme.id, definition, { update });
    themeState.discordTheme = getLastDiscordTheme();
}

export async function initThemes() {
    themeState = await createFileStorage<ThemeState>("themes.json", defaults);
    setBackgroundHidden(themeState.hideBackground);
    refreshLibraryThemes();
    if (isSafeMode()) return;
    onDiscordThemeChange(theme => {
        themeState.discordTheme = theme;
        if (themeState.selected && themeState.base === "auto") apply();
    });
    if (!themeState.selected) return;
    patchChatBackground();
    try {
        apply({ update: false });
        logger.info(`Theme ${themeInfo(getSelectedTheme()!)?.name ?? themeState.selected} applied`);
    } catch (e) {
        logger.error(`Theme ${themeState.selected} failed to apply; using Discord's colours`, e);
        themeState.selected = null;
    }
}

function store(theme: InstalledTheme) {
    describeTheme(theme.manifest);
    themeState.installed[theme.id] = theme;
    return themeState.installed[theme.id];
}

async function fetchManifest(url: string) {
    const response = await fetch(url, { cache: "no-store" } as RequestInit);
    if (!response.ok) throw new Error(`Couldn't download the theme (HTTP ${response.status})`);
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error("That link isn't a theme file (not JSON)");
    }
}

export async function installFromUrl(url: string) {
    const trimmed = url.trim();
    if (themeState.installed[trimmed]) throw new Error("That theme is already installed");
    return store({ id: trimmed, source: "url", url: trimmed, manifest: await fetchManifest(trimmed), installedAt: Date.now() });
}

export function installFromText(text: string) {
    let manifest: any;
    try {
        manifest = JSON.parse(text);
    } catch {
        throw new Error("That isn't valid JSON");
    }
    const info = describeTheme(manifest);
    const id = `local:${info.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
    return store({ id, source: "local", manifest, installedAt: Date.now() });
}

export function addFromLibrary(entry: LibraryTheme) {
    const id = libraryId(entry.id);
    return themeState.installed[id] ?? store({ id, source: "library", manifest: entry.manifest, installedAt: Date.now() });
}

/** A theme a plugin hands over directly (Bunny's `selectTheme({ id, data })`); replaced on each call. */
export function applyPluginTheme(id: string, manifest: any) {
    const theme = store({ id: `plugin:${id}`, source: "plugin", manifest, installedAt: Date.now() });
    selectTheme(theme.id);
    return theme;
}

export const isFromLibraryInstalled = (entry: LibraryTheme) => libraryId(entry.id) in themeState.installed;

export function selectTheme(id: string | null) {
    if (id && !themeState.installed[id]) throw new Error("That theme isn't installed");
    const previous = themeState.selected;
    themeState.selected = id;
    try {
        if (id) patchChatBackground();
        apply();
    } catch (e) {
        themeState.selected = previous;
        try { apply(); } catch { }
        throw e;
    }
}

export function removeTheme(id: string) {
    if (themeState.selected === id) selectTheme(null);
    delete themeState.installed[id];
}

export function setBase(base: ThemeState["base"]) {
    themeState.base = base;
    if (themeState.selected) apply();
}

export function setHideBackground(value: boolean) {
    themeState.hideBackground = value;
    setBackgroundHidden(value);
    if (themeState.selected) apply();
}

/** Re-downloads themes installed from a link and refreshes library ones from this build. */
export async function updateThemes() {
    const results = await Promise.allSettled(Object.values(themeState.installed).map(async theme => {
        if (theme.source === "url" && theme.url) theme.manifest = await fetchManifest(theme.url);
        if (theme.source === "library") {
            const entry = LIBRARY.find(candidate => libraryId(candidate.id) === theme.id);
            if (entry) theme.manifest = entry.manifest;
        }
    }));
    if (themeState.selected) apply();
    return results.filter(result => result.status === "rejected").length;
}

/** Library themes are refreshed from the build at startup, so fixes reach installed copies. */
export function refreshLibraryThemes() {
    for (const entry of LIBRARY) {
        const installed = themeState.installed[libraryId(entry.id)];
        if (installed) installed.manifest = entry.manifest;
    }
}
