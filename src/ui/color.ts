// Discord's color tokens. Plugins use these as `semanticColors.X` / `rawColors.X`
// (Vendetta's `@vendetta/ui`). Reference: examples/Kettu-github/src/lib/ui/color.ts

import { proxyLazy } from "@/lib/lazy";
import { findByProps } from "@/metro";
import { constants, ThemeStore } from "@/metro/common";

/** The token module: `{ colors, unsafe_rawColors, internal|meta: { resolveSemanticColor, isSemanticColor } }`. */
function colorModule(): any {
    const module = findByProps("SemanticColor")?.default ?? findByProps("unsafe_rawColors", "colors");
    // Older plugins read `.meta`, which newer Discord renamed to `.internal`.
    if (module && !module.meta && module.internal) module.meta = module.internal;
    return module;
}

/**
 * Color tokens Discord renamed, and their current equivalent. Plugins written against older
 * versions use the old names for text, icons and backgrounds; without these they get undefined.
 */
const RENAMED_COLORS: Record<string, string> = {
    TEXT_NORMAL: "TEXT_DEFAULT",
    TEXT_PRIMARY: "TEXT_STRONG",
    HEADER_PRIMARY: "TEXT_STRONG",
    HEADER_SECONDARY: "TEXT_MUTED",
    LOGO_PRIMARY: "TEXT_STRONG",
    TEXT_WARNING: "TEXT_FEEDBACK_WARNING",
    TEXT_DANGER: "TEXT_FEEDBACK_CRITICAL",
    TEXT_POSITIVE: "TEXT_FEEDBACK_POSITIVE",
    INTERACTIVE_NORMAL: "INTERACTIVE_TEXT_DEFAULT",
    INTERACTIVE_HOVER: "INTERACTIVE_TEXT_HOVER",
    INTERACTIVE_ACTIVE: "INTERACTIVE_TEXT_ACTIVE",
    BACKGROUND_PRIMARY: "BACKGROUND_BASE_LOWER",
    BACKGROUND_SECONDARY: "BACKGROUND_BASE_LOWEST",
    BACKGROUND_TERTIARY: "BACKGROUND_BASE_LOWEST",
    BACKGROUND_FLOATING: "BACKGROUND_SURFACE_HIGHEST",
    BACKGROUND_MOBILE_PRIMARY: "BACKGROUND_BASE_LOWER",
    BACKGROUND_MOBILE_SECONDARY: "BACKGROUND_BASE_LOWEST",
    BG_BASE_SECONDARY: "BACKGROUND_BASE_LOW",
    BACKGROUND_MODIFIER_ACCENT: "BACKGROUND_MOD_NORMAL",
    BACKGROUND_MESSAGE_HIGHLIGHT_HOVER: "MESSAGE_HIGHLIGHT_BACKGROUND_HOVER",
    CARD_PRIMARY_BG: "CARD_BACKGROUND_DEFAULT",
    BORDER_FAINT: "BORDER_SUBTLE",
    INPUT_PLACEHOLDER_TEXT: "INPUT_PLACEHOLDER_TEXT_DEFAULT",
    DEPRECATED_QUICKSWITCHER_INPUT_BACKGROUND: "INPUT_BACKGROUND_DEFAULT",
    ANDROID_RIPPLE: "MOBILE_ANDROID_BUTTON_BACKGROUND_RIPPLE",
    BRAND_500: "BACKGROUND_BRAND",
    REDESIGN_BUTTON_PRIMARY_BACKGROUND: "CONTROL_PRIMARY_BACKGROUND_DEFAULT",
    REDESIGN_BUTTON_PRIMARY_TEXT: "CONTROL_PRIMARY_TEXT_DEFAULT",
    REDESIGN_BUTTON_SECONDARY_BACKGROUND: "CONTROL_SECONDARY_BACKGROUND_DEFAULT",
    REDESIGN_BUTTON_SECONDARY_TEXT: "CONTROL_SECONDARY_TEXT_DEFAULT",
    REDESIGN_BUTTON_DANGER_BACKGROUND: "CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT",
    REDESIGN_BUTTON_DANGER_TEXT: "CONTROL_CRITICAL_PRIMARY_TEXT_DEFAULT",
    REDESIGN_BUTTON_DESTRUCTIVE_BACKGROUND: "CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT",
    REDESIGN_BUTTON_DESTRUCTIVE_TEXT: "CONTROL_CRITICAL_PRIMARY_TEXT_DEFAULT",
    BUTTON_SECONDARY_BACKGROUND: "CONTROL_SECONDARY_BACKGROUND_DEFAULT",
    BUTTON_DANGER_BACKGROUND: "CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT",
    BUTTON_POSITIVE_BACKGROUND: "CONTROL_CONNECTED_BACKGROUND_DEFAULT",
};

let aliasedColors: Record<string, any> | undefined;
let aliasedSource: object | undefined;
/** Discord's semantic colors, with renamed tokens also reachable under their old names. */
function withRenamedColors(colors: Record<string, any>): Record<string, any> {
    if (!colors) return colors;
    if (aliasedSource === colors && aliasedColors) return aliasedColors;
    aliasedSource = colors;
    return aliasedColors = new Proxy(colors, {
        get: (target, key) => key in target || typeof key !== "string" || !(key in RENAMED_COLORS) ? target[key as any] : target[RENAMED_COLORS[key]],
        has: (target, key) => key in target || (typeof key === "string" && key in RENAMED_COLORS && RENAMED_COLORS[key] in target),
    });
}

export const semanticColors: Record<string, any> = proxyLazy(() => withRenamedColors(colorModule()?.colors ?? constants.ThemeColorMap), { hint: "semanticColors" });
export const rawColors: Record<string, string> = proxyLazy(() => colorModule()?.unsafe_rawColors ?? constants.Colors, { hint: "rawColors" });

export function isSemanticColor(color: unknown): boolean {
    return colorModule()?.meta?.isSemanticColor?.(color) ?? false;
}

/** Resolves a semantic color token for the current (or given) theme. */
export function resolveSemanticColor(color: unknown, theme: string = ThemeStore.theme): string | undefined {
    return colorModule()?.meta?.resolveSemanticColor?.(theme, color);
}

/** Adds the legacy `meta` alias early so plugins' own `findByProps("colors", "meta")` match. */
export function prepareColorModule() {
    colorModule();
}

/** The raw module, for compat layers that expose it directly. */
export const colorTokens = proxyLazy(colorModule, { hint: "color tokens" });

/**
 * Discord's constants with `ThemeColorMap` (the semantic colors) restored: it used to live there,
 * and older plugins read `constants.ThemeColorMap.X`.
 */
export const constantsWithColors: Record<string, any> = proxyLazy(() => new Proxy(constants as Record<string, any>, {
    get: (target, key) => key === "ThemeColorMap" && target.ThemeColorMap == null ? semanticColors : target[key as any],
}), { hint: "constants" });
