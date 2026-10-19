// Installing fonts and telling the tweak which of Discord's fonts they replace.

import { callNative } from "@/core/bridge";
import { removeFile } from "@/core/fs";
import { Logger } from "@/lib/logger";

import { type FontFace, type InstalledFont, settings } from "./settings";

const logger = new Logger("FontLoader");

/** Discord's font names (PostScript names of the bundled fonts) and the weight/style each stands for. */
const TEXT_FONTS: Record<string, [number, boolean]> = {
    "ggsans-Normal": [400, false],
    "ggsans-NormalItalic": [400, true],
    "ggsans-Medium": [500, false],
    "ggsans-MediumItalic": [500, true],
    "ggsans-Semibold": [600, false],
    "ggsans-SemiboldItalic": [600, true],
    "ggsans-Bold": [700, false],
    "ggsans-BoldItalic": [700, true],
    "ggsans-ExtraBold": [800, false],
    "ggsans-ExtraBoldItalic": [800, true],
};
const HEADING_FONTS: Record<string, [number, boolean]> = {
    "ABCGintoNord-ExtraBold": [800, false],
    "ABCGintoNord-ExtraBoldItalic": [800, true],
    "ABCGintoDiscordNord-Bold": [700, false],
    "ABCGintoDiscordNord-BoldItalic": [700, true],
    "ABCGintoDiscordNord-BlackItalic": [900, true],
};
const CODE_FONTS: Record<string, [number, boolean]> = {
    "ggmono-Normal": [400, false],
    "ggmono-Semibold": [600, false],
    "ggmono-Bold": [700, false],
    "SourceCodePro-Normal": [400, false],
    "SourceCodePro-Semibold": [600, false],
    "SourceCodePro-Bold": [700, false],
};

/** Popular Google Fonts, for one-tap installs. */
export const SUGGESTED = [
    "Inter", "Roboto", "Open Sans", "Lato", "Nunito", "Poppins", "Montserrat", "Rubik", "Quicksand",
    "Comfortaa", "Lexend", "Atkinson Hyperlegible", "Noto Serif", "Merriweather", "Comic Neue",
    "JetBrains Mono", "Fira Code", "Source Code Pro", "IBM Plex Mono", "Roboto Mono",
];

interface NativeFace {
    postScriptName: string;
    family: string;
    style: string;
    weight: number;
    italic: boolean;
    monospace: boolean;
}

export interface FontsInfo {
    hooked: boolean;
    scope: "app" | "messages";
    map: Record<string, string>;
    helpers: string[];
    registered: string[];
    hits: { name: number; descriptor: number; helper: number };
}

/** "unknown" until checked; "missing" when the installed tweak predates font support. */
export let nativeSupport: "unknown" | "ok" | "missing" = "unknown";

export async function checkNativeSupport() {
    try {
        await callNative<FontsInfo>("fonts.info");
        nativeSupport = "ok";
    } catch (e) {
        nativeSupport = "missing";
        if (!/Unknown method|bridge unavailable/.test(String(e))) logger.warn("Font support check failed", e);
    }
    return nativeSupport;
}

export const nativeInfo = () => callNative<FontsInfo>("fonts.info");

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "font";
export const googleFontId = (family: string) => `google-${slug(family)}`;

/** The face closest to `weight`, preferring the same style. */
function closest(faces: FontFace[], weight: number, italic: boolean) {
    const sameStyle = faces.filter(face => face.italic === italic);
    const pool = sameStyle.length ? sameStyle : faces;
    return pool.reduce((best, face) => {
        const distance = Math.abs(face.weight - weight), bestDistance = Math.abs(best.weight - weight);
        // Ties go to the heavier face for bold weights and the lighter one otherwise.
        if (distance !== bestDistance) return distance < bestDistance ? face : best;
        return (weight > 400) === (face.weight > best.weight) ? face : best;
    });
}

function mapFonts(names: Record<string, [number, boolean]>, font: InstalledFont | undefined, map: Record<string, string>, files: Set<string>) {
    if (!font?.faces.length) return;
    for (const [name, [weight, italic]] of Object.entries(names)) {
        const face = closest(font.faces, weight, italic);
        map[name] = face.postScriptName;
        files.add(face.path);
    }
}

/** What the tweak gets: which of Discord's fonts become which, and the files they come from. */
export function buildTable() {
    const map: Record<string, string> = {};
    const files = new Set<string>();
    const text = settings.text ? settings.fonts[settings.text] : undefined;
    mapFonts(TEXT_FONTS, text, map, files);
    if (settings.headings) mapFonts(HEADING_FONTS, text, map, files);
    const code = settings.code === "text" ? text : settings.code ? settings.fonts[settings.code] : undefined;
    mapFonts(CODE_FONTS, code, map, files);
    // Every installed font is registered, so the settings page can preview them.
    for (const font of Object.values(settings.fonts)) font.faces.forEach(face => files.add(face.path));
    return { scope: settings.scope, files: [...files], map };
}

/** Sends the current choice to the tweak. Returns problems it reported (missing files, unloadable fonts). */
export async function applyFonts(): Promise<string[]> {
    if (nativeSupport !== "ok") return [];
    const result = await callNative<{ active: number; problems: string[] }>("fonts.apply", buildTable());
    if (result.problems?.length) logger.warn(`Font problems: ${result.problems.join("; ")}`);
    return result.problems ?? [];
}

/** Restores Discord's fonts (from the next launch on, and for text drawn from now on). */
export async function clearFonts() {
    if (nativeSupport !== "ok") return;
    await callNative("fonts.apply", { scope: settings.scope, files: [], map: {} });
}

async function download(url: string, path: string) {
    await callNative("fs.download", url, path);
    return callNative<NativeFace[]>("fonts.inspect", path);
}

/** Google Fonts' search (the endpoint fonts.google.com uses, like Equicord's FontLoader). */
export async function searchGoogleFonts(query: string): Promise<{ family: string; authors: string[] }[]> {
    const response = await fetch("https://fonts.google.com/$rpc/fonts.fe.catalog.actions.metadata.MetadataService/FontSearch", {
        method: "POST",
        headers: { "content-type": "application/json+protobuf", "x-user-agent": "grpc-web-javascript/0.1" },
        body: JSON.stringify([[query, null, null, null, null, null, 1], [5], null, 16]),
    });
    if (!response.ok) throw new Error(`Google Fonts search failed (HTTP ${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data?.[1])) return [];
    return data[1]
        .map((entry: any) => ({ family: entry?.[1]?.[0], authors: Array.isArray(entry?.[1]?.[2]) ? entry[1][2] : [] }))
        .filter((font: { family: unknown }) => typeof font.family === "string");
}

/** Static font files Google serves for `family`, for weights 400-800 upright and italic. */
async function googleFaces(family: string) {
    const axes = [0, 1].flatMap(italic => [400, 500, 600, 700, 800].map(weight => `${italic},${weight}`)).join(";");
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${axes}&display=swap`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(response.status === 400 ? `Google Fonts has no font called ${family}` : `Couldn't reach Google Fonts (HTTP ${response.status})`);
    const css = await response.text();
    const faces: { url: string; weight: number; italic: boolean }[] = [];
    for (const block of css.split("@font-face").slice(1)) {
        const src = /src:\s*url\(([^)]+)\)\s*format\(['"](truetype|opentype)['"]\)/.exec(block)?.[1];
        const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? 400);
        const italic = /font-style:\s*italic/.test(block);
        // A font split into unicode ranges repeats each weight; the first block is the Latin one.
        if (src && !faces.some(face => face.weight === weight && face.italic === italic)) faces.push({ url: src, weight, italic });
    }
    if (!faces.length) throw new Error(`Google Fonts didn't return font files for ${family}`);
    return faces;
}

export async function installGoogleFont(family: string): Promise<InstalledFont> {
    const id = googleFontId(family);
    if (settings.fonts[id]) return settings.fonts[id];
    const faces: FontFace[] = [];
    let monospace = false;
    for (const face of await googleFaces(family)) {
        const path = `fonts/${id}/${face.weight}${face.italic ? "i" : ""}.ttf`;
        const [info] = await download(face.url, path);
        if (!info?.postScriptName) continue;
        monospace ||= info.monospace;
        faces.push({ path, postScriptName: info.postScriptName, weight: face.weight, italic: face.italic });
    }
    if (!faces.length) throw new Error(`Couldn't load ${family}`);
    const font: InstalledFont = { id, name: family, source: "google", faces, monospace: monospace || /mono|code/i.test(family), installedAt: Date.now() };
    settings.fonts[id] = font;
    return settings.fonts[id];
}

/** A .ttf or .otf (or .ttc collection) from a link. */
export async function installFontFromUrl(link: string): Promise<InstalledFont> {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) throw new Error("Enter an http(s) link to a .ttf or .otf file");
    const existing = Object.values(settings.fonts).find(font => font.url === url);
    if (existing) return existing;

    const extension = /\.(otf|ttc|ttf)(?:$|[?#])/i.exec(url)?.[1]?.toLowerCase() ?? "ttf";
    const id = `url-${Date.now().toString(36)}`;
    const path = `fonts/${id}/font.${extension}`;
    let infos: NativeFace[];
    try {
        infos = await download(url, path);
    } catch (e) {
        await removeFile(`fonts/${id}`).catch(() => { });
        throw e;
    }
    const usable = infos.filter(info => info.postScriptName);
    if (!usable.length) throw new Error("That file has no usable fonts");
    const font: InstalledFont = {
        id,
        name: usable[0].family || usable[0].postScriptName,
        source: "url",
        url,
        faces: usable.map(info => ({ path, postScriptName: info.postScriptName, weight: info.weight, italic: info.italic })),
        monospace: usable.some(info => info.monospace),
        installedAt: Date.now(),
    };
    settings.fonts[id] = font;
    return settings.fonts[id];
}

export async function removeFont(id: string) {
    if (settings.text === id) settings.text = null;
    if (settings.code === id) settings.code = null;
    delete settings.fonts[id];
    await applyFonts().catch(() => { });
    await removeFile(`fonts/${id}`).catch(() => { });
}

/** Weights and styles of an installed font, for its subtitle ("400, 700 · italic"). */
export function describeFaces(font: InstalledFont) {
    const weights = [...new Set(font.faces.map(face => face.weight))].sort((a, b) => a - b);
    const italic = font.faces.some(face => face.italic);
    return `${weights.join(", ")}${italic ? " · italic" : ""}${font.monospace ? " · monospace" : ""}`;
}

/** PostScript name of the font's regular face, for previews (registered once applied). */
export function previewName(font: InstalledFont) {
    return closest(font.faces, 400, false).postScriptName;
}
