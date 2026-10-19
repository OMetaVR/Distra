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
}

export const defaults: FontLoaderSettings = { fonts: {}, text: null, code: null, headings: true, scope: "app" };

export let settings: FontLoaderSettings = { ...defaults, fonts: {} };

export async function loadSettings() {
    settings = await createFileStorage<FontLoaderSettings>("plugins/data/core-fontloader.json", defaults);
    settings.fonts ??= {};
}
