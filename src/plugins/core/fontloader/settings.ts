import { createFileStorage } from "@/core/storage";

/** One file of an installed font: a single weight and style. */
export interface FontFace {
    /** Relative to Documents/Distra. */
    path: string;
    postScriptName: string;
    weight: number;
    italic: boolean;
}

export interface InstalledFont {
    id: string;
    name: string;
    source: "google" | "url";
    /** The font file's link, for fonts installed from one. */
    url?: string;
    faces: FontFace[];
    monospace: boolean;
    installedAt: number;
}

/** Size, weight and line spacing of one of the fonts. */
export interface FontAdjust {
    /** Size in percent of Discord's. */
    size: number;
    /** First scale the font to gg sans's letter height and width (and its line height in the chat). */
    match: boolean;
    /** Added to the weight Discord asks for (-200 to 200), then the closest installed weight is used. */
    weight: number;
    /** Line height in percent. */
    spacing: number;
}

export type FontGroup = "text" | "code";

export const defaultAdjust: FontAdjust = { size: 100, match: false, weight: 0, spacing: 100 };

export interface FontLoaderSettings {
    fonts: Record<string, InstalledFont>;
    /** Font for Discord's text (gg sans), or null for Discord's. */
    text: string | null;
    /** Font for code (gg mono): an installed font, "text" for the text font, or null for Discord's. */
    code: string | null;
    /** Also replace the heading font (ABC Ginto, used for big titles). */
    headings: boolean;
    /** "app": everything; "messages": only natively drawn text (the chat). */
    scope: "app" | "messages";
    adjust: Record<FontGroup, FontAdjust>;
}

export const defaults: FontLoaderSettings = {
    fonts: {}, text: null, code: null, headings: true, scope: "app",
    adjust: { text: { ...defaultAdjust }, code: { ...defaultAdjust } },
};

export let settings: FontLoaderSettings = { ...defaults, fonts: {} };

export async function loadSettings() {
    settings = await createFileStorage<FontLoaderSettings>("plugins/data/core-fontloader.json", defaults);
    settings.fonts ??= {};
    settings.adjust ??= { text: { ...defaultAdjust }, code: { ...defaultAdjust } };
    for (const group of ["text", "code"] as const) {
        const adjust = settings.adjust[group];
        if (!adjust || Object.keys(defaultAdjust).some(key => !(key in adjust))) settings.adjust[group] = { ...defaultAdjust, ...adjust };
    }
}
