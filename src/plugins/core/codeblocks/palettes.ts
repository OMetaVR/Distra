// Colours for highlight.js scopes. A palette maps a scope ("title.function", or a shorter prefix
// such as "title") to a colour; `null` resets to the plain text colour (string interpolation, ...).
// A token takes the colour of its innermost scope that has one, like nested spans in CSS.
//
// "discord" is desktop Discord's code stylesheet (the --text-code-* colours of each theme),
// "vscode" VS Code's Dark+/Light+ (ShikiCodeblocks' default look), "github" GitHub's,
// and "theme" builds one from the current theme's semantic colours (follows custom themes).

import { ThemeStore } from "@/metro/common";
import { resolveSemanticColor, semanticColors } from "@/ui/color";

export type PaletteId = "discord" | "vscode" | "github" | "theme";
export type Palette = Record<string, string | null>;

/** Desktop's code colours per theme. */
interface CodeColors {
    keyword: string; type: string; title: string; attribute: string; decorator: string; property: string;
    number: string; operator: string; string: string; builtin: string; comment: string; tag: string;
    bullet: string; addition: string; deletion: string;
}

/** Desktop's `.hljs-*` rules (variables, literals and params are plain text there). */
const discordPalette = (c: CodeColors): Palette => ({
    doctag: c.keyword, keyword: c.keyword, "template-tag": c.keyword, "template-variable": c.keyword, "variable.language": c.keyword,
    type: c.type, built_in: c.type,
    title: c.title,
    literal: null, params: null, variable: null, "selector-attr": null, "selector-class": null, "selector-id": null,
    attr: c.attribute, attribute: c.attribute,
    meta: c.decorator,
    property: c.property,
    number: c.number,
    operator: c.operator,
    string: c.string, regexp: c.string,
    symbol: c.builtin,
    comment: c.comment, code: c.comment, formula: c.comment,
    name: c.tag, quote: c.tag, "selector-pseudo": c.tag, "selector-tag": c.tag,
    subst: null, emphasis: null, strong: null,
    section: c.keyword, bullet: c.bullet, link: c.bullet,
    addition: c.addition, deletion: c.deletion,
});

const DISCORD: Record<string, CodeColors> = {
    dark: {
        keyword: "#ffbdb9", type: "#ffb6ed", title: "#bccaff", attribute: "#abcfff", decorator: "#ffc252", property: "#8edae1",
        number: "#fcc0a1", operator: "#ffcfcd", string: "#96dda9", builtin: "#ffc252", comment: "#b3b3b9", tag: "#ffb6ed",
        bullet: "#abcfff", addition: "#99e0ad", deletion: "#ffbdb9",
    },
    darker: {
        keyword: "#ff9691", type: "#ff8be2", title: "#9db0ff", attribute: "#82b7f8", decorator: "#f49f00", property: "#63c1ca",
        number: "#efa275", operator: "#ffaba6", string: "#73c48b", builtin: "#f49f00", comment: "#999aa1", tag: "#ff8be2",
        bullet: "#82b7f8", addition: "#7ac991", deletion: "#ff9691",
    },
    midnight: {
        keyword: "#f67774", type: "#ff59d5", title: "#8195fb", attribute: "#5ea0f1", decorator: "#dc8d00", property: "#36abb6",
        number: "#e18752", operator: "#fc8884", string: "#57af74", builtin: "#dc8d00", comment: "#888991", tag: "#ff59d5",
        bullet: "#5ea0f1", addition: "#5bb277", deletion: "#f67774",
    },
    light: {
        keyword: "#a9232e", type: "#9b277e", title: "#404eb1", attribute: "#0158ab", decorator: "#884800", property: "#00636e",
        number: "#963b03", operator: "#971d28", string: "#006734", builtin: "#884800", comment: "#696a73", tag: "#9b277e",
        bullet: "#0158ab", addition: "#005f30", deletion: "#9e1f2a",
    },
};

/** VS Code Dark+ / Light+. */
const VSCODE: Record<"dark" | "light", Palette> = {
    dark: {
        keyword: "#569cd6", "keyword.control": "#c586c0", "variable.language": "#569cd6", literal: "#569cd6", symbol: "#569cd6",
        type: "#4ec9b0", built_in: "#4ec9b0", "title.class": "#4ec9b0", title: "#dcdcaa", "title.function": "#dcdcaa",
        params: "#9cdcfe", variable: "#9cdcfe", "variable.constant": "#4fc1ff", property: "#9cdcfe", attr: "#9cdcfe", attribute: "#9cdcfe",
        number: "#b5cea8", string: "#ce9178", "char.escape": "#d7ba7d", regexp: "#d16969", subst: null,
        comment: "#6a9955", quote: "#6a9955", doctag: "#569cd6", meta: "#c586c0", "meta string": "#ce9178",
        name: "#569cd6", tag: "#808080", "selector-tag": "#d7ba7d", "selector-class": "#d7ba7d", "selector-id": "#d7ba7d",
        "selector-pseudo": "#d7ba7d", "selector-attr": "#d7ba7d", section: "#569cd6", bullet: "#6796e6", link: "#ce9178",
        code: "#ce9178", "template-tag": "#c586c0", "template-variable": "#569cd6", addition: "#b5cea8", deletion: "#ce9178",
        operator: null, punctuation: null, emphasis: null, strong: null,
    },
    light: {
        keyword: "#0000ff", "keyword.control": "#af00db", "variable.language": "#0000ff", literal: "#0000ff", symbol: "#0000ff",
        type: "#267f99", built_in: "#267f99", "title.class": "#267f99", title: "#795e26", "title.function": "#795e26",
        params: "#001080", variable: "#001080", "variable.constant": "#0070c1", property: "#001080", attr: "#0451a5", attribute: "#e50000",
        number: "#098658", string: "#a31515", "char.escape": "#ee0000", regexp: "#811f3f", subst: null,
        comment: "#008000", quote: "#008000", doctag: "#0000ff", meta: "#af00db", "meta string": "#a31515",
        name: "#800000", tag: "#800000", "selector-tag": "#800000", "selector-class": "#800000", "selector-id": "#800000",
        "selector-pseudo": "#800000", "selector-attr": "#800000", section: "#800000", bullet: "#0451a5", link: "#a31515",
        code: "#a31515", "template-tag": "#af00db", "template-variable": "#0000ff", addition: "#098658", deletion: "#a31515",
        operator: null, punctuation: null, emphasis: null, strong: null,
    },
};

/** GitHub's syntax colours (highlight.js github / github-dark). */
const githubPalette = (k: string, entity: string, constant: string, str: string, variable: string, comment: string, tag: string, heading: string, list: string, add: string, del: string): Palette => ({
    doctag: k, keyword: k, "template-tag": k, "template-variable": k, type: k, "variable.language": k,
    title: entity,
    attr: constant, attribute: constant, literal: constant, meta: constant, number: constant, operator: constant, variable: constant,
    "selector-attr": constant, "selector-class": constant, "selector-id": constant,
    regexp: str, string: str, "meta string": str, "meta keyword": k,
    built_in: variable, symbol: variable,
    comment, code: comment, formula: comment,
    name: tag, quote: tag, "selector-tag": tag, "selector-pseudo": tag,
    subst: null, emphasis: null, strong: null,
    section: heading, bullet: list, addition: add, deletion: del,
});

const GITHUB = {
    dark: githubPalette("#ff7b72", "#d2a8ff", "#79c0ff", "#a5d6ff", "#ffa657", "#8b949e", "#7ee787", "#1f6feb", "#f2cc60", "#aff5b4", "#ffdcd7"),
    light: githubPalette("#d73a49", "#6f42c1", "#005cc5", "#032f62", "#e36209", "#6a737d", "#22863a", "#005cc5", "#735c0f", "#22863a", "#b31d28"),
};

/** Semantic colour tokens per scope (the first the theme has wins). */
const THEME_TOKENS: Record<string, string[]> = {
    keyword: ["PREMIUM_NITRO_PINK_TEXT", "TEXT_BRAND"], doctag: ["PREMIUM_NITRO_PINK_TEXT", "TEXT_BRAND"],
    "variable.language": ["PREMIUM_NITRO_PINK_TEXT", "TEXT_BRAND"], "template-variable": ["PREMIUM_NITRO_PINK_TEXT", "TEXT_BRAND"],
    name: ["TEXT_FEEDBACK_CRITICAL", "TEXT_DANGER"], "selector-tag": ["TEXT_FEEDBACK_CRITICAL", "TEXT_DANGER"],
    deletion: ["TEXT_FEEDBACK_CRITICAL", "TEXT_DANGER"], symbol: ["TEXT_FEEDBACK_CRITICAL", "TEXT_DANGER"],
    string: ["TEXT_FEEDBACK_POSITIVE", "TEXT_POSITIVE"], regexp: ["TEXT_FEEDBACK_POSITIVE", "TEXT_POSITIVE"],
    addition: ["TEXT_FEEDBACK_POSITIVE", "TEXT_POSITIVE"],
    number: ["TEXT_FEEDBACK_WARNING", "TEXT_WARNING"], literal: ["TEXT_FEEDBACK_WARNING", "TEXT_WARNING"],
    "variable.constant": ["TEXT_FEEDBACK_WARNING", "TEXT_WARNING"],
    title: ["TEXT_FEEDBACK_INFO", "TEXT_LINK"], built_in: ["TEXT_FEEDBACK_INFO", "TEXT_LINK"],
    type: ["STATUS_WARNING", "TEXT_WARNING"], "title.class": ["STATUS_WARNING", "TEXT_WARNING"],
    attr: ["TEXT_BRAND", "TEXT_LINK"], attribute: ["TEXT_BRAND", "TEXT_LINK"], property: ["TEXT_BRAND", "TEXT_LINK"],
    section: ["TEXT_BRAND", "TEXT_LINK"], bullet: ["TEXT_BRAND", "TEXT_LINK"],
    meta: ["TEXT_SUBTLE", "TEXT_MUTED"], comment: ["TEXT_MUTED"], quote: ["TEXT_MUTED"],
};

function themePalette(): Palette {
    const palette: Palette = { subst: null };
    for (const [scope, names] of Object.entries(THEME_TOKENS)) {
        for (const name of names) {
            const token = semanticColors[name];
            const color = token != null ? resolveSemanticColor(token) : undefined;
            if (color) {
                palette[scope] = color;
                break;
            }
        }
    }
    return palette;
}

/** Perceived brightness of a "#rrggbb" colour (0-1). */
function brightness(color: string | undefined) {
    const m = color?.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
    if (!m) return undefined;
    const [r, g, b] = m.slice(1, 4).map(x => parseInt(x, 16) / 255);
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** "dark", "darker", "midnight" or "light", corrected by the text colour for custom themes. */
export function themeVariant(): keyof typeof DISCORD {
    const theme = String(ThemeStore?.theme ?? "dark");
    const text = semanticColors.TEXT_DEFAULT ?? semanticColors.TEXT_NORMAL;
    const light = brightness(text != null ? resolveSemanticColor(text) : undefined);
    const isLight = light != null ? light < 0.5 : theme === "light";
    if (isLight) return "light";
    return theme in DISCORD && theme !== "light" ? theme as keyof typeof DISCORD : "dark";
}

export function getPalette(id: PaletteId): Palette {
    const variant = themeVariant();
    const dark = variant === "light" ? "light" : "dark";
    switch (id) {
        case "vscode": return VSCODE[dark];
        case "github": return GITHUB[dark];
        case "theme": return themePalette();
        default: return discordPalette(DISCORD[variant]);
    }
}

/** Keywords VS Code colours as control flow. */
const CONTROL = new Set("if else elif elsif for foreach while do switch case default break continue return throw try catch except finally raise import export from as await yield goto match when unless until then fi done esac with pass".split(" "));

/** Colour for one scope ("title.function"): itself, then shorter prefixes. */
function scopeColor(scope: string, palette: Palette, text: string): string | null | undefined {
    if (scope === "keyword" && "keyword.control" in palette && CONTROL.has(text.trim())) return palette["keyword.control"];
    for (let name = scope; name; name = name.slice(0, Math.max(0, name.lastIndexOf(".")))) {
        if (name in palette) return palette[name];
        if (!name.includes(".")) break;
    }
    return undefined;
}

/** Colour for a token's scopes (outermost first), or null for plain text. */
export function tokenColor(scopes: string, palette: Palette, text: string): string | null {
    if (!scopes) return null;
    const list = scopes.split(" ");
    for (let i = list.length - 1; i >= 0; i--) {
        // Two-level rules ("meta string") beat single scopes.
        if (i > 0) {
            const pair = palette[`${list[i - 1]} ${list[i]}`];
            if (pair !== undefined) return pair;
        }
        const color = scopeColor(list[i], palette, text);
        if (color !== undefined) return color;
    }
    return null;
}

/** Desktop's ```ansi colours (30-37 foreground, 40-47 background). */
export const ANSI_FG = ["#4f545c", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#ffffff"];
export const ANSI_BG = ["#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3"];
