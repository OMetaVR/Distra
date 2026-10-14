// Finds "fake" emoji and stickers in message text: the Discord CDN image links that Freemoji and
// FreeStickers (and Equicord's FakeNitro) send when you can't use the real thing. No Discord imports:
// everything Discord-specific (stores, animated lookups) is passed in through `Lookup`.

export const StickerFormat = { PNG: 1, APNG: 2, LOTTIE: 3, GIF: 4 } as const;

export interface FakeSticker {
    id: string;
    name: string;
    format_type: number;
}

export interface Analysis {
    /** The message text with fake emoji turned into `<:name:id>` and fake stickers removed. */
    content: string;
    emojis: number;
    stickers: FakeSticker[];
    /** `kind/id` of every link that was turned into something real ("emojis/123", "stickers/456"). */
    converted: Set<string>;
}

export interface Options {
    emojis: boolean;
    stickers: boolean;
    /** Also convert links inside longer messages (otherwise only messages made of nothing else). */
    inline: boolean;
}

export interface Lookup {
    /** Whether the emoji with this id is known to be animated (undefined when unknown). */
    emojiAnimated(id: string): boolean | undefined;
    /** What Discord knows about the sticker, when it is one the user has. */
    sticker(id: string): { name?: string; format_type?: number } | undefined;
    /** Whether the image behind `kind/id` is animated, according to its link embed. */
    embedAnimated(kind: string, id: string): boolean | undefined;
}

const HOST = String.raw`https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)`;
// kind, id, extension, query
const URL_SOURCE = String.raw`${HOST}\/(emojis|stickers)\/(\d+)\.(png|webp|gif|avif)(?:\?([^\s)>\]]*))?`;
const MASKED = new RegExp(String.raw`\[([^\]\n]*)\]\(\s*<?${URL_SOURCE}>?\s*\)`, "g");
const BARE = new RegExp(String.raw`<?${URL_SOURCE}>?`, "g");

/** Whether `text` could contain a fake at all (cheap check before running the regexes). */
export const mayContainFakes = (text: unknown): text is string =>
    typeof text === "string" && text.includes("discordapp.") && (text.includes("/emojis/") || text.includes("/stickers/"));

function queryParam(query: string | undefined, key: string): string | undefined {
    if (!query) return undefined;
    for (const pair of query.split("&")) {
        const [name, value] = pair.split("=");
        if (name === key && value != null) {
            try { return decodeURIComponent(value.replace(/\+/g, " ")); } catch { return value; }
        }
    }
    return undefined;
}

/** `<:name:id>` needs a word-character name. */
const emojiName = (name: string | undefined) => (name ?? "").replace(/\W+/g, "_").replace(/^_+|_+$/g, "") || "emoji";

interface Found {
    start: number;
    end: number;
    kind: string;
    id: string;
    ext: string;
    query?: string;
    label?: string;
}

function findAll(text: string): Found[] {
    const found: Found[] = [];
    for (const match of text.matchAll(MASKED)) {
        found.push({ start: match.index!, end: match.index! + match[0].length, label: match[1], kind: match[2], id: match[3], ext: match[4], query: match[5] });
    }
    for (const match of text.matchAll(BARE)) {
        const start = match.index!;
        const end = start + match[0].length;
        // Skip bare matches that are the link inside a masked link.
        if (found.some(other => start >= other.start && end <= other.end)) continue;
        found.push({ start, end, kind: match[1], id: match[2], ext: match[3], query: match[4] });
    }
    return found.sort((a, b) => a.start - b.start);
}

export function analyze(text: string, options: Options, lookup: Lookup): Analysis {
    const result: Analysis = { content: text, emojis: 0, stickers: [], converted: new Set() };
    const wanted = findAll(text).filter(found => found.kind === "emojis" ? options.emojis : options.stickers);
    if (!wanted.length) return result;

    if (!options.inline) {
        // Only when the message is nothing but fakes.
        let rest = text;
        for (const found of [...wanted].reverse()) rest = rest.slice(0, found.start) + rest.slice(found.end);
        if (rest.trim()) return result;
    }

    let output = "";
    let cursor = 0;
    const seenStickers = new Set<string>();
    for (const found of wanted) {
        output += text.slice(cursor, found.start);
        cursor = found.end;
        const key = `${found.kind}/${found.id}`;
        result.converted.add(key);

        if (found.kind === "emojis") {
            const name = emojiName(queryParam(found.query, "name") ?? found.label);
            const animated = found.ext === "gif"
                || queryParam(found.query, "animated") === "true"
                || (lookup.emojiAnimated(found.id) ?? lookup.embedAnimated(found.kind, found.id) ?? false);
            output += `<${animated ? "a" : ""}:${name}:${found.id}>`;
            result.emojis++;
            continue;
        }

        // A sticker: it leaves the text and becomes a sticker item below the message.
        if (seenStickers.has(found.id)) continue;
        seenStickers.add(found.id);
        const known = lookup.sticker(found.id);
        const label = found.label?.trim();
        const name = known?.name ?? queryParam(found.query, "name") ?? (label && label !== found.id ? label : undefined) ?? "Sticker";
        let format: number = known?.format_type ?? StickerFormat.PNG;
        if (found.ext === "gif") format = StickerFormat.GIF;
        else if (known?.format_type == null && lookup.embedAnimated(found.kind, found.id)) format = StickerFormat.APNG;
        result.stickers.push({ id: found.id, name, format_type: format });
    }
    output += text.slice(cursor);
    result.content = output.trim() === "" ? "" : output;
    return result;
}

const EMBED_URL = /^https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(emojis|stickers)\/(\d+)\./;

/** The `kind/id` an embed shows, when it is a plain image link to an emoji or sticker. */
export function embedTarget(embed: any): string | undefined {
    for (const url of [embed?.url, embed?.image?.url, embed?.image?.proxyURL, embed?.thumbnail?.url]) {
        if (typeof url !== "string") continue;
        const match = EMBED_URL.exec(url) ?? /\/(emojis|stickers)\/(\d+)\.\w+(?:$|\?)/.exec(url);
        if (match) return `${match[1]}/${match[2]}`;
    }
    return undefined;
}
