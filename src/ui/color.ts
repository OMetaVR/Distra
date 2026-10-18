// Discord's color tokens. Plugins use these as `semanticColors.X` / `rawColors.X`
// (Vendetta's `@vendetta/ui`). Reference: examples/Kettu-github/src/lib/ui/color.ts

import { proxyLazy } from "@/lib/lazy";
import { findByProps } from "@/metro";
import { constants, ThemeStore } from "@/metro/common";
import { RENAMED_COLORS } from "@/lib/colorNames";

/** The token module: `{ colors, unsafe_rawColors, internal|meta: { resolveSemanticColor, isSemanticColor } }`. */
function colorModule(): any {
    const module = findByProps("SemanticColor")?.default ?? findByProps("unsafe_rawColors", "colors");
    // Older plugins read `.meta`, which newer Discord renamed to `.internal`.
    if (module && !module.meta && module.internal) module.meta = module.internal;
    return module;
}


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
