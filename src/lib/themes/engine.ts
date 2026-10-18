// Applies a theme definition to Discord. Discord picks colours by theme name ("dark", "darker",
// "midnight", "light"), so a theme is registered as an extra name whose colours copy its base
// theme's, and Discord is switched to it:
//
//   - resolveSemanticColor answers from the theme for that name, falling back to the base theme;
//   - RawColor getters return the theme's raw colours (old palette names are carried over to the
//     current palette entries that had the same stock value);
//   - ThemeTypes reports the theme name for its base, so dark/light checks keep working;
//   - ThemeStore.theme returns the theme's name while one is applied. Nothing is written to Discord's
//     appearance settings (synced or local), so other devices and turning Distra off are unaffected;
//   - native code is told the base name, and gets the resolved colours through the tweak.
//
// Ported from Bunny/Kettu's colour engine (src/lib/addons/themes/colors), adapted to Discord 348.

import { callNative } from "@/core/bridge";
import { getNativeModule } from "@/core/native";
import { logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { findByProps, findByStoreName } from "@/metro";

import { withOpacity } from "./color";
import type { BaseTheme, ThemeDefinition } from "./parser";

const KEY_PREFIX = "distra-theme-";
const isOurs = (theme: unknown) => typeof theme === "string" && theme.startsWith(KEY_PREFIX);

interface Current {
    key: string;
    name: string;
    definition: ThemeDefinition;
    /** Raw colours with old palette names carried over. */
    raw: Record<string, string>;
}

let current: Current | null = null;
let counter = 0;
let installed = false;
let lastDiscordTheme: BaseTheme = "darker";
const listeners = new Set<() => void>();

const tokens = () => findByProps("SemanticColor");
const resolverHost = () => tokens()?.default?.meta ?? tokens()?.default?.internal;

export const getAppliedTheme = () => current;
export const getLastDiscordTheme = () => lastDiscordTheme;
export const onThemeApplied = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));

/** Discord's semantic token names. */
export function semanticTokens(): Set<string> {
    return new Set(Object.keys(tokens()?.SemanticColor ?? {}));
}

/** Stock raw colour value (before any theme). */
let stockRaw: Record<string, string> = {};
export const stockRawColor = (name: string) => stockRaw[name];

const luminance = (hex: string) => {
    const n = parseInt(hex.slice(1, 7), 16);
    return (0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff)) / 255;
};
const mix = (a: string, b: string, t: number) => {
    const ca = parseInt(a.slice(1, 9).padEnd(8, "f"), 16) >>> 0, cb = parseInt(b.slice(1, 9).padEnd(8, "f"), 16) >>> 0;
    const channel = (shift: number) => Math.round(((ca >>> shift) & 0xff) * (1 - t) + ((cb >>> shift) & 0xff) * t).toString(16).padStart(2, "0");
    return `#${channel(24)}${channel(16)}${channel(8)}${channel(0)}`;
};

/**
 * Most themes recolour Discord's old grey palette (PRIMARY_100 ... PRIMARY_900); current Discord
 * draws its surfaces and text from a finer NEUTRAL_1 ... NEUTRAL_100 ramp instead. Both are the same
 * grey ramp, so each NEUTRAL step takes the theme's colours for the PRIMARY steps around it,
 * blended by where it sits between them in brightness.
 */
function expandRaw(raw: Record<string, string>) {
    const out = { ...raw };
    const anchors = Object.keys(raw)
        .filter(key => /^PRIMARY_\d+$/.test(key) && typeof stockRaw[key] === "string")
        .map(key => ({ l: luminance(stockRaw[key]), color: raw[key] }))
        .sort((a, b) => a.l - b.l);
    const ordered = consistentAnchors(anchors);
    if (!ordered.length) return out;

    for (const [key, stock] of Object.entries(stockRaw)) {
        if (!/^NEUTRAL_\d+$/.test(key) || key in raw || typeof stock !== "string") continue;
        const l = luminance(stock);
        const above = ordered.findIndex(anchor => anchor.l >= l);
        if (above === 0 || above === -1) {
            // Outside the theme's range: only take the end colour if it's close.
            const end = above === 0 ? ordered[0] : ordered[ordered.length - 1];
            if (Math.abs(end.l - l) <= 0.04) out[key] = end.color;
            continue;
        }
        const low = ordered[above - 1], high = ordered[above];
        out[key] = high.l === low.l ? high.color : mix(low.color, high.color, (l - low.l) / (high.l - low.l));
    }
    return out;
}

/**
 * The largest set of palette colours whose brightness follows the stock order (themes sometimes
 * reuse a step for an unrelated colour, e.g. a dark background on a light grey step); blending
 * across those would muddy the ramp.
 */
function consistentAnchors(anchors: { l: number; color: string }[]) {
    if (anchors.length < 3) return anchors;
    const themed = anchors.map(anchor => luminance(anchor.color));
    const length = anchors.map(() => 1), previous = anchors.map(() => -1);
    for (let i = 0; i < anchors.length; i++) {
        for (let j = 0; j < i; j++) {
            if (themed[j] <= themed[i] && length[j] + 1 > length[i]) {
                length[i] = length[j] + 1;
                previous[i] = j;
            }
        }
    }
    let end = length.indexOf(Math.max(...length));
    const keep: typeof anchors = [];
    for (; end !== -1; end = previous[end]) keep.unshift(anchors[end]);
    return keep;
}

/** Name of the token a colour object passed to resolveSemanticColor stands for. */
let tokenSymbol: symbol | undefined;
function tokenName(colorObject: any): string | undefined {
    if (typeof colorObject === "string") return colorObject;
    if (!colorObject || typeof colorObject !== "object") return undefined;
    tokenSymbol ??= Object.getOwnPropertySymbols(colorObject)[0];
    const name = tokenSymbol ? colorObject[tokenSymbol] : undefined;
    return typeof name === "string" ? name : undefined;
}

function resolve(name: string): string | undefined {
    if (!current) return undefined;
    const themed = current.definition.semantic[name];
    if (themed) return themed;
    const stock = tokens()?.SemanticColor?.[name]?.[current.definition.reference];
    const raw = stock?.raw && current.raw[stock.raw];
    return raw ? withOpacity(raw, stock.opacity ?? 1) : undefined;
}

function installPatches() {
    if (installed) return;
    installed = true;
    const ref = tokens();
    stockRaw = { ...ref.RawColor };

    // Theme names Discord compares against (ThemeTypes.ONYX === "midnight", ...).
    const themeTypes = findByProps("ThemeTypes")?.ThemeTypes;
    if (themeTypes) {
        for (const [typeKey, value] of Object.entries({ ...themeTypes })) {
            Object.defineProperty(themeTypes, typeKey, {
                configurable: true,
                enumerable: true,
                get: () => current && current.definition.reference === value ? current.key : value,
            });
        }
    }

    for (const key of Object.keys(stockRaw)) {
        Object.defineProperty(ref.RawColor, key, {
            configurable: true,
            enumerable: true,
            get: () => current?.raw[key] ?? stockRaw[key],
        });
    }

    corePatcher.instead("resolveSemanticColor", resolverHost(), (args, original) => {
        if (!current || args[0] !== current.key) return original(...args);
        const name = tokenName(args[1]);
        const themed = name ? resolve(name) : undefined;
        return themed ?? original(current.definition.reference, ...args.slice(1));
    });

    const nativeTheme = getNativeModule("NativeThemeModule", "RTNThemeManager", "DCDTheme");
    if (typeof nativeTheme?.updateTheme === "function") {
        corePatcher.before("updateTheme", nativeTheme, args => isOurs(args[0]) && current ? [current.definition.reference, ...args.slice(1)] : undefined);
    }

    // The theme name Discord renders with. Discord's own setting is left alone.
    const ThemeStore = findByStoreName("ThemeStore");
    const owner = ThemeStore && findOwner(ThemeStore, "theme");
    const stockTheme = owner && Object.getOwnPropertyDescriptor(owner, "theme");
    if (stockTheme?.get) {
        const read = stockTheme.get;
        discordTheme = () => read.call(ThemeStore);
        Object.defineProperty(owner, "theme", {
            configurable: true,
            enumerable: stockTheme.enumerable,
            get() {
                return current ? current.key : read.call(this);
            },
        });
        corePatcher.addCleanup(() => Object.defineProperty(owner, "theme", stockTheme));
        // Follow changes to Discord's own theme (the base for "auto").
        ThemeStore.addChangeListener?.(() => {
            const theme = discordTheme();
            if (typeof theme === "string" && theme !== lastDiscordTheme) {
                lastDiscordTheme = theme as BaseTheme;
                discordThemeListeners.forEach(listener => listener(lastDiscordTheme));
            }
        });
    }
}

let discordTheme = (): string | undefined => findByStoreName("ThemeStore")?.theme;
const discordThemeListeners = new Set<(theme: BaseTheme) => void>();
/** Called when the user changes Discord's own theme while a Distra theme is applied. */
export const onDiscordThemeChange = (listener: (theme: BaseTheme) => void) =>
    (discordThemeListeners.add(listener), () => void discordThemeListeners.delete(listener));

function findOwner(object: any, property: string) {
    for (let proto = object; proto; proto = Object.getPrototypeOf(proto)) {
        if (Object.getOwnPropertyDescriptor(proto, property)) return proto;
    }
    return null;
}

/** Registers `key` as a Discord theme with the base theme's colours, shadows and dividers. */
function register(key: string, reference: BaseTheme) {
    const ref = tokens();
    ref.Theme[key.toUpperCase().replace(/-/g, "_")] = key;
    for (const token of Object.keys(ref.SemanticColor)) {
        const stock = ref.SemanticColor[token]?.[reference];
        if (stock) ref.SemanticColor[token][key] = { ...stock };
    }
    for (const shadow of Object.values<any>(ref.Shadow ?? {})) {
        if (shadow?.[reference]) shadow[key] = shadow[reference];
    }
    const dividers = findByProps("DIVIDER_COLORS")?.DIVIDER_COLORS;
    if (dividers?.[reference]) dividers[key] = dividers[reference];
}

/**
 * Applies `definition` (or Discord's own theme for null). `update` switches Discord over now; at
 * startup it's left off, since Discord reads the (patched) stored theme when it starts.
 */
export function applyDefinition(name: string | null, definition: ThemeDefinition | null, { update = true } = {}) {
    if (definition) installPatches();
    if (!installed) return;

    const theme = discordTheme();
    if (typeof theme === "string" && !isOurs(theme)) lastDiscordTheme = theme as BaseTheme;

    if (definition) {
        const key = `${KEY_PREFIX}${++counter}`;
        register(key, definition.reference);
        current = { key, name: name ?? "Theme", definition, raw: expandRaw(definition.raw) };
    } else {
        current = null;
    }

    if (update) {
        try {
            findByStoreName("ThemeStore")?.emitChange?.();
            // Discord's own refresh: re-themes the native side (patched above to the base name).
            findByProps("_interceptors", "dispatch")?.dispatch?.({ type: "REFRESH_THEME" });
        } catch (e) {
            logger.error("Couldn't refresh Discord's theme", e);
        }
    }

    listeners.forEach(listener => listener());
    void writeNativeColors();
}

const camelCase = (token: string) => token.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Sends the resolved colours of every token the theme changes to the tweak, for natively drawn UI. */
async function writeNativeColors() {
    const colors: Record<string, string> = {};
    if (current) {
        for (const token of Object.keys(tokens()?.SemanticColor ?? {})) {
            const value = resolve(token);
            if (value) colors[camelCase(token)] = value;
        }
    }
    try {
        await callNative("theme.setNative", { name: current?.name ?? null, colors });
    } catch (e) {
        // Tweaks older than 0.1.1 don't have native theming; JS-drawn UI is still themed.
        if (!/Unknown method/.test(String(e))) logger.warn("Couldn't apply native theme colours", e);
    }
}
