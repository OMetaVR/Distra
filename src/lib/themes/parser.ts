// Theme files -> one flat definition the engine applies. Three formats are in use:
//
//   - Vendetta / Revenge, spec 2: `semanticColors: { TOKEN: [dark, light, amoled?, darker?] }`,
//     `rawColors`, `background: { url, blur, alpha }`.
//   - Bunny / Kettu / rain, spec 3: `main: { type, semantic, raw, background }`, where a semantic value
//     is a colour, a raw colour name, or `{ type, value, opacity }`.
//   - Enmity: `theme_color_map: { TOKEN: [dark, light] }`, `colours`/`colors` and `unsafe_colors`.
//
// Most published themes target older Discord versions, so token names Discord has since renamed are
// carried over to their current names (unless the theme also sets the current name itself).
//
// Pure: Discord's token list is passed in, so this can be tested without the app.

import { RENAMED_COLORS } from "@/lib/colorNames";

import { normalizeColor, withOpacity } from "./color";

/** Discord's base themes (ThemeTypes values in 348): Ash, Light, Onyx and Dark. */
export type BaseTheme = "dark" | "darker" | "midnight" | "light";
export type ThemeFormat = "vendetta" | "bunny" | "enmity";

export interface ThemeAuthor { name: string; id?: string }

export interface ThemeInfo {
    name: string;
    description?: string;
    authors: ThemeAuthor[];
    format: ThemeFormat;
    /** Which modes the theme has colours for. */
    modes: "dark" | "light" | "both";
    /** A few representative colours, for previews. */
    swatches: string[];
}

export interface ThemeBackground { url: string; blur?: number; opacity?: number }

export interface ThemeDefinition {
    /** The Discord theme anything the theme doesn't set falls back to. */
    reference: BaseTheme;
    /** Semantic token -> "#rrggbbaa", opacity already applied. */
    semantic: Record<string, string>;
    /** Raw colour name -> "#rrggbbaa". */
    raw: Record<string, string>;
    background?: ThemeBackground;
}

export interface ParseContext {
    /** Discord's current semantic tokens. */
    tokens: ReadonlySet<string>;
    /** Stock value of a raw colour, for spec 3 references like `"BRAND_500"`. */
    rawColor: (name: string) => string | undefined;
    /** Discord's (or the chosen) base theme. */
    base: BaseTheme;
    /**
     * Whether the user picked the base in Distra's settings. Otherwise each theme falls back to the
     * base it was designed for: old (spec 2 / Enmity) themes to Ash, which matches old Discord's dark
     * theme, and spec 3 themes to Dark, unless they carry colours for the user's base.
     */
    explicitBase?: boolean;
}

/**
 * Old token names -> current ones, beyond Discord's straight renames: the background and modifier
 * families were restructured, so these are the closest current equivalents. Targets that don't
 * exist are skipped, so a wrong guess costs nothing.
 */
const LEGACY_TOKENS: Record<string, string[]> = {
    BACKGROUND_PRIMARY: ["BACKGROUND_BASE_LOWER", "CHANNEL_BACKGROUND_DEFAULT"],
    BACKGROUND_SECONDARY: ["BACKGROUND_BASE_LOWEST"],
    BACKGROUND_TERTIARY: ["BACKGROUND_BASE_LOWEST"],
    BACKGROUND_FLOATING: ["BACKGROUND_SURFACE_HIGHEST", "MOBILE_ACTIONSHEET_BACKGROUND"],
    BACKGROUND_NESTED_FLOATING: ["BACKGROUND_SURFACE_HIGH"],
    BACKGROUND_MOBILE_PRIMARY: ["BACKGROUND_BASE_LOWER", "CHANNEL_BACKGROUND_DEFAULT"],
    BACKGROUND_MOBILE_SECONDARY: ["BACKGROUND_BASE_LOWEST"],
    BG_BASE_PRIMARY: ["BACKGROUND_BASE_LOWER", "CHANNEL_BACKGROUND_DEFAULT"],
    BG_BASE_SECONDARY: ["BACKGROUND_BASE_LOW"],
    BG_BASE_TERTIARY: ["BACKGROUND_BASE_LOWEST"],
    BG_SURFACE_OVERLAY: ["BACKGROUND_SURFACE_HIGH"],
    BG_SURFACE_OVERLAY_TMP: ["BACKGROUND_SURFACE_HIGH"],
    BG_SURFACE_RAISED: ["BACKGROUND_SURFACE_HIGH", "CARD_BACKGROUND_DEFAULT"],
    BG_BACKDROP: ["BACKGROUND_SCRIM"],
    BG_MOD_FAINT: ["BACKGROUND_MOD_SUBTLE"],
    BG_MOD_SUBTLE: ["BACKGROUND_MOD_NORMAL"],
    BG_MOD_STRONG: ["BACKGROUND_MOD_STRONG"],
    BACKGROUND_MODIFIER_HOVER: ["BACKGROUND_MOD_SUBTLE"],
    BACKGROUND_MODIFIER_ACTIVE: ["BACKGROUND_MOD_STRONG"],
    BACKGROUND_MODIFIER_SELECTED: ["BACKGROUND_MOD_STRONG", "MOBILE_CHANNEL_ITEM_BACKGROUND_SELECTED"],
    CHAT_BACKGROUND: ["BACKGROUND_BASE_LOWER"],
    CHANNELTEXTAREA_BACKGROUND: ["MOBILE_CHATINPUT_BACKGROUND_DEFAULT"],
    EMBED_BACKGROUND: ["MOBILE_EMBED_BACKGROUND_DEFAULT"],
    CARD_PRIMARY_BG: ["CARD_BACKGROUND_DEFAULT"],
    HEADER_PRIMARY: ["TEXT_STRONG", "MOBILE_TEXT_HEADING_PRIMARY"],
    TEXT_NORMAL: ["TEXT_DEFAULT", "ICON_DEFAULT"],
    INTERACTIVE_NORMAL: ["INTERACTIVE_TEXT_DEFAULT", "INTERACTIVE_ICON_DEFAULT"],
};

/** Enmity's names for the old dark palette. */
const ENMITY_RAW: Record<string, string> = {
    PRIMARY_DARK: "PRIMARY_100",
    ...Object.fromEntries(["100", "200", "300", "360", "400", "500", "600", "630", "700", "800", "900"].map(n => [`PRIMARY_DARK_${n}`, `PRIMARY_${n}`])),
};

const asObject = (value: unknown): Record<string, any> | undefined =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;

export function themeFormat(manifest: any): ThemeFormat | null {
    if (!asObject(manifest)) return null;
    if (manifest.spec === 3 && asObject(manifest.main)) return "bunny";
    if (asObject(manifest.theme_color_map)) return "enmity";
    if (manifest.spec === 2 || asObject(manifest.semanticColors) || asObject(manifest.rawColors)) return "vendetta";
    return null;
}

function authorsOf(manifest: any): ThemeAuthor[] {
    const list = manifest.display?.authors ?? manifest.authors ?? (manifest.author ? [manifest.author] : []);
    return (Array.isArray(list) ? list : [list])
        .map((author: any) => typeof author === "string" ? { name: author } : author?.name ? { name: String(author.name), id: author.id } : null)
        .filter(Boolean) as ThemeAuthor[];
}

/**
 * Whether a spec 2 / Enmity colour map really has a light variant. Many dark-only themes fill the
 * light slot with copies or other dark shades, so it counts only if its backgrounds are light.
 */
function hasLightVariant(map: Record<string, unknown>) {
    const brightness = (color: string | undefined) => {
        if (!color) return undefined;
        const n = parseInt(color.slice(1, 7), 16);
        return (0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff)) / 255;
    };
    const backgrounds = Object.entries(map)
        .filter(([key, values]) => /BACKGROUND|^BG_/.test(key) && Array.isArray(values) && values[1])
        .map(([, values]) => brightness(normalizeColor((values as unknown[])[1])))
        .filter((value): value is number => value != null);
    if (!backgrounds.length) return false;
    return backgrounds.reduce((sum, value) => sum + value, 0) / backgrounds.length > 0.5;
}

/** Index into a spec 2 / Enmity colour array for `base`: [dark, light, amoled, darker]. */
function variantIndex(values: unknown[], base: BaseTheme) {
    if (base === "light") return values[1] ? 1 : 0;
    if (base === "midnight" && values[2]) return 2;
    if (base === "darker" && values[3]) return 3;
    return 0;
}

/** Describes a theme without applying it. Throws if it isn't one. */
export function describeTheme(manifest: any): ThemeInfo {
    const format = themeFormat(manifest);
    if (!format) throw new Error("Not a theme: expected a Vendetta (spec 2), Bunny (spec 3) or Enmity theme");

    let modes: ThemeInfo["modes"] = "dark";
    if (format === "bunny") {
        modes = manifest.main.type === "light" ? "light" : "dark";
    } else {
        if (hasLightVariant(asObject(format === "enmity" ? manifest.theme_color_map : manifest.semanticColors) ?? {})) modes = "both";
    }

    const name = manifest.display?.name ?? manifest.name;
    if (typeof name !== "string" || !name.trim()) throw new Error("The theme has no name");

    const ctx: ParseContext = { tokens: new Set(), rawColor: () => undefined, base: modes === "light" ? "light" : "dark" };
    const definition = parseTheme(manifest, { ...ctx, tokens: { has: () => true } as any });
    const pick = (...keys: string[]) => keys.map(key => definition.semantic[key]).find(Boolean);
    const swatches = [
        pick("BACKGROUND_BASE_LOWER", "BACKGROUND_PRIMARY", "BG_BASE_PRIMARY", "BACKGROUND_MOBILE_PRIMARY"),
        pick("BACKGROUND_BASE_LOWEST", "BACKGROUND_SECONDARY", "BG_BASE_SECONDARY", "BACKGROUND_TERTIARY"),
        pick("TEXT_DEFAULT", "TEXT_NORMAL", "HEADER_PRIMARY"),
        pick("TEXT_LINK", "BACKGROUND_BRAND", "INTERACTIVE_ACTIVE", "CONTROL_BRAND_FOREGROUND") ?? definition.raw.BRAND_500 ?? definition.raw.BRAND_360,
    ].filter(Boolean) as string[];

    return {
        name: name.trim(),
        description: manifest.display?.description ?? manifest.description,
        authors: authorsOf(manifest),
        format,
        modes,
        swatches,
    };
}

export function parseTheme(manifest: any, ctx: ParseContext): ThemeDefinition {
    const format = themeFormat(manifest);
    if (!format) throw new Error("Not a theme");

    const semantic: Record<string, string> = {};
    const raw: Record<string, string> = {};
    let background: ThemeBackground | undefined;
    let reference: BaseTheme = ctx.base;

    if (format === "bunny") {
        const main = manifest.main;
        const light = main.type === "light";
        // A dark theme on a light base (or the reverse) would fall back to the wrong colours.
        reference = light ? "light" : ctx.explicitBase && ctx.base !== "light" ? ctx.base : "darker";

        for (const [key, value] of Object.entries(asObject(main.raw) ?? {})) {
            const color = normalizeColor(value);
            if (color) raw[key] = color;
        }
        for (const [key, value] of Object.entries(asObject(main.semantic) ?? {})) {
            const ref = asObject(value);
            const source = ref ? ref.value : value;
            const opacity = typeof ref?.opacity === "number" ? ref.opacity : 1;
            const color = normalizeColor(source) ?? (typeof source === "string" ? raw[source] ?? normalizeColor(ctx.rawColor(source)) : undefined);
            if (color) semantic[key] = withOpacity(color, opacity);
        }
        const bg = asObject(main.background);
        if (typeof bg?.url === "string") background = { url: bg.url, blur: bg.blur, opacity: bg.opacity ?? bg.alpha };
    } else {
        const map = asObject(format === "enmity" ? manifest.theme_color_map : manifest.semanticColors) ?? {};
        const arrays = Object.values(map).filter(Array.isArray) as unknown[][];
        if (ctx.base === "light") reference = hasLightVariant(map) ? "light" : "dark";
        else if (ctx.explicitBase) reference = ctx.base;
        else if (ctx.base === "midnight" && arrays.some(values => values[2])) reference = "midnight";
        else if (ctx.base === "darker" && arrays.some(values => values[3])) reference = "darker";
        else reference = "dark";

        for (const [key, values] of Object.entries(map)) {
            if (!Array.isArray(values)) continue;
            const color = normalizeColor(values[variantIndex(values, reference)] ?? values[0]);
            if (color) semantic[key] = color;
        }

        const rawSources = format === "enmity"
            ? [asObject(manifest.colours) ?? asObject(manifest.colors), asObject(manifest.unsafe_colors)]
            : [asObject(manifest.rawColors)];
        for (const source of rawSources) {
            for (const [key, value] of Object.entries(source ?? {})) {
                const color = normalizeColor(value);
                if (!color) continue;
                raw[key] = color;
                if (format === "enmity" && ENMITY_RAW[key]) raw[ENMITY_RAW[key]] ??= color;
            }
        }

        const bg = asObject(manifest.background);
        if (typeof bg?.url === "string") background = { url: bg.url, blur: bg.blur, opacity: bg.alpha ?? bg.opacity };
    }

    carryLegacyTokens(semantic, ctx.tokens);
    return { reference, semantic, raw, background };
}

/** Copies colours set under old token names onto their current names, without overriding explicit ones. */
function carryLegacyTokens(semantic: Record<string, string>, tokens: ReadonlySet<string>) {
    const explicit = new Set(Object.keys(semantic));
    for (const key of explicit) {
        if (tokens.has(key) && !(key in LEGACY_TOKENS) && !(key in RENAMED_COLORS)) continue;
        const targets = [...(LEGACY_TOKENS[key] ?? []), ...(RENAMED_COLORS[key] ? [RENAMED_COLORS[key]] : [])];
        for (const target of targets) {
            if (target === key || explicit.has(target) || !tokens.has(target) || target in semantic) continue;
            semantic[target] = semantic[key];
        }
    }
}
