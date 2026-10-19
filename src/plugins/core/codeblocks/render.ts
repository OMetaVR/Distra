// Rewrites code blocks as Discord builds chat rows (RowManager#generate). A row's `codeBlock` node
// (lang, content, inQuote) is drawn natively as one box in one colour. Two ways to colour it:
//
// - With the tweak's code block hook (DSTCodeBlocks.m): the node is kept and carries the colours
//   (`distraHighlight`: UTF-16 spans + colour table + label). Rows reach native as JSON, and the
//   chat's attributed string generator gets the node dictionaries, extra keys included; the hook
//   colours the code inside Discord's box and adds the language as a header strip at its top.
// - Without it (tweak 0.1.0): the block is rebuilt from nodes the native renderer does colour:
//   `link` nodes (coloured through their target's linkColor) around text, or around `inlineCode`
//   runs for the code font (iOS pads each with U+205F spaces, hence the gaps). The label is a
//   small chip above the block. Discord's box is lost in this mode.

import { coloredNode, MESSAGE_ROW, RowManager, textNode } from "@/lib/chatRows";
import type { Patcher } from "@/lib/patcher";
import { ThemeStore } from "@/metro/common";

import { getLanguage, type Language, parseAnsi, stripAnsi, type Token, tokenize } from "./highlight";
import { ANSI_BG, ANSI_FG, getPalette, type Palette, themeVariant, tokenColor } from "./palettes";
import { settings } from "./settings";

export const TAP_ACTION = "distraCodeBlock";
/** Key of the colours on a codeBlock node, read by the tweak. */
export const NATIVE_KEY = "distraHighlight";

/** Longer blocks stay plain (highlighting runs on the JS thread while the chat builds rows). */
const MAX_CHARS_NATIVE = 12000;
/** Rebuilt blocks: rows with thousands of nodes lay out slowly. */
const MAX_CHARS_JS = 6000;
const MAX_NODES_JS = 2500;

/**
 * What the tweak does with code blocks: nothing (tweak 0.1.0), colours them and adds the header
 * ("box", Discord's YYText message text), or only colours them ("colors": with Discord's "YYText
 * replacement" experiment message text is built in Swift, where we don't insert text).
 */
export type NativeMode = "none" | "box" | "colors";
let nativeHook: NativeMode = "none";
export const setNativeHook = (mode: NativeMode) => void (nativeHook = mode);
export const hasNativeHook = () => nativeHook !== "none";

const FLAG_BOLD = 1;
const FLAG_UNDERLINE = 2;
const FLAG_ITALIC = 4;

/** A run of code with its colours. */
type Segment = [text: string, color: string | null, background: string | null, flags: number];

// --- caches ----------------------------------------------------------------------------------

/** Bounded insertion-ordered map: the oldest entries go first. */
class Lru<V> extends Map<string, V> {
    constructor(private limit: number) { super(); }
    set(key: string, value: V) {
        this.delete(key);
        super.set(key, value);
        if (this.size > this.limit) this.delete(this.keys().next().value!);
        return this;
    }
}

/** Tokens per language + code. */
const tokenCache = new Lru<Token[]>(300);
/** Built nodes per message id + edit + block + settings/palette. */
const nodeCache = new Lru<{ code: string; shown: string; nodes: any[]; highlighted: boolean }>(300);
/** The code of each block in a message, for copying, and whether we drew it highlighted. */
const messageBlocks = new Lru<{ code: string[]; highlighted: boolean[] }>(500);

export const getMessageBlocks = (messageId: string) => messageBlocks.get(messageId)?.code;
export const getHighlightedBlocks = (messageId: string) => {
    const blocks = messageBlocks.get(messageId);
    return blocks?.code.filter((_, i) => blocks.highlighted[i]) ?? [];
};

export function clearCaches() {
    nodeCache.clear();
    messageBlocks.clear();
}

function cachedTokens(code: string, languageId: string) {
    const key = `${languageId}\0${code}`;
    let tokens = tokenCache.get(key);
    if (!tokens) tokenCache.set(key, tokens = tokenize(code, languageId));
    return tokens;
}

// --- colouring -------------------------------------------------------------------------------

/** "#rrggbb" at low alpha, for diff line backgrounds. */
const tint = (color: string | null) => color && /^#[\da-f]{6}$/i.test(color) ? `${color}26` : null;

function segmentsOf(code: string, language: Language, palette: Palette): { text: string; segments: Segment[] } {
    if (language.id === "ansi") {
        const light = themeVariant() === "light";
        const segments: Segment[] = parseAnsi(code).map(run => [
            run.text,
            run.fg == null || (light && run.fg === 7) ? null : ANSI_FG[run.fg],
            run.bg == null ? null : ANSI_BG[run.bg],
            (run.bold ? FLAG_BOLD : 0) | (run.underline ? FLAG_UNDERLINE : 0),
        ]);
        return { text: segments.map(s => s[0]).join(""), segments };
    }
    const segments: Segment[] = [];
    for (const [scopes, text] of cachedTokens(code, language.id)) {
        const color = tokenColor(scopes, palette, text);
        const inner = scopes.slice(scopes.lastIndexOf(" ") + 1);
        const diff = / (addition|deletion)\b|^(addition|deletion)\b/.test(scopes);
        const flags = (/(^| )(section|strong)\b/.test(scopes) ? FLAG_BOLD : 0) | (inner === "emphasis" ? FLAG_ITALIC : 0);
        const prev = segments[segments.length - 1];
        const background = diff ? tint(color) : null;
        if (prev && prev[1] === color && prev[2] === background && prev[3] === flags) prev[0] += text;
        else segments.push([text, color, background, flags]);
    }
    return { text: code, segments };
}

/** The first `length` characters of `segments`. */
function clip(segments: Segment[], length: number) {
    const out: Segment[] = [];
    let text = "";
    for (const segment of segments) {
        if (text.length >= length) break;
        const part = segment[0].slice(0, length - text.length);
        out.push([part, segment[1], segment[2], segment[3]]);
        text += part;
    }
    return { text, segments: out };
}

/** The payload the tweak reads: [start, length, colour, background, flags] per coloured run. */
function nativePayload(segments: Segment[], label: string | undefined) {
    const colors: string[] = [];
    const index = (color: string | null) => {
        if (!color) return -1;
        let i = colors.indexOf(color);
        if (i < 0) i = colors.push(color) - 1;
        return i;
    };
    const spans: number[] = [];
    let at = 0;
    for (const [text, color, background, flags] of segments) {
        if (color || background || flags) spans.push(at, text.length, index(color), index(background), flags);
        at += text.length;
    }
    return { v: 1, spans, colors, ...label ? { label } : {} };
}

// --- JS-only rendering (no native hook) ------------------------------------------------------

const inlineCode = (content: string) => ({ type: "inlineCode", content });

/** Text in the code font (inline code runs; their newlines stay plain text). */
function codeText(text: string): any[] {
    if (!settings.monospace) return [textNode(text)];
    const out: any[] = [];
    text.split("\n").forEach((line, index) => {
        if (index) out.push(textNode("\n"));
        if (line) out.push(inlineCode(line));
    });
    return out;
}

/** Joins "A, whitespace, A" runs of one colour into one segment (fewer nodes). */
function joinRuns(segments: Segment[]) {
    const out: Segment[] = [];
    for (const segment of segments) {
        const gap = out[out.length - 1];
        const before = out[out.length - 2];
        if (before && segment[1] && before[1] === segment[1] && !gap[1] && /^[ \t]+$/.test(gap[0])) {
            out.pop();
            before[0] += gap[0] + segment[0];
        } else out.push([...segment]);
    }
    return out;
}

function jsNodes(segments: Segment[], payload: Record<string, unknown>) {
    const out: any[] = [];
    let plain = "";
    const flush = () => {
        if (plain) out.push(...codeText(plain));
        plain = "";
    };
    for (const [text, color, , flags] of joinRuns(segments)) {
        if (!color) {
            plain += text;
            continue;
        }
        flush();
        let content = codeText(text);
        if (flags & FLAG_BOLD) content = [{ type: "strong", content }];
        // Newlines inside a coloured run stay outside the link, so each line is its own run.
        const runs: any[][] = [[]];
        for (const node of content) {
            if (node.type === "text" && node.content === "\n") runs.push([node], []);
            else runs[runs.length - 1].push(node);
        }
        for (const run of runs) {
            if (!run.length) continue;
            if (run.length === 1 && run[0].type === "text" && run[0].content === "\n") out.push(run[0]);
            else out.push(coloredNode(run, color, payload));
        }
    }
    flush();
    return out;
}

/** The language chip above a rebuilt block. */
function labelNode(label: string, payload: Record<string, unknown>, color: string | undefined) {
    const chip = [inlineCode(label)];
    return { type: "subtext", content: settings.tapToCopy && color ? [coloredNode(chip, color, payload)] : chip };
}

// --- rewriting rows --------------------------------------------------------------------------

interface Built { nodes: any[]; highlighted: boolean; code: string }

/** Discord's parser drops ```ansi escape codes; the block as written, from the message's markdown. */
function rawAnsiBlock(content: string, markdown: string | undefined) {
    if (!markdown?.includes("\u001b")) return undefined;
    const shown = content.trimEnd();
    for (const m of markdown.matchAll(/```ansi\n([\s\S]*?)```/gi)) {
        let raw = m[1];
        if (/^>/.test(raw) && raw.split("\n").every(line => !line || line.startsWith(">"))) raw = raw.replace(/^> ?/gm, "");
        if (stripAnsi(raw).trimEnd() === shown) return raw;
    }
    return undefined;
}

/** What replaces one code block node. */
function buildBlock(node: any, payload: Record<string, unknown>, palette: Palette, markdown?: string): Built {
    const tag = typeof node.lang === "string" ? node.lang.trim() : "";
    const language = getLanguage(tag);
    const label = settings.header && tag ? (settings.fullName && language ? language.name : tag) : undefined;
    const code: string = node.content;
    const limit = nativeHook !== "none" ? MAX_CHARS_NATIVE : MAX_CHARS_JS;
    let colored: { text: string; segments: Segment[] } | undefined;
    if (settings.highlight && language && code.length <= limit) {
        const source = language.id === "ansi" ? rawAnsiBlock(code, markdown) ?? code : code;
        try {
            colored = segmentsOf(source, language, palette);
        } catch (e) {
            console.error("[BetterCodeBlocks] highlighting failed", e);
        }
        // The colours index the text Discord draws (its parser trims trailing whitespace).
        if (colored && colored.text !== code) colored = colored.text.trimEnd() === code.trimEnd() ? clip(colored.segments, code.length) : undefined;
    }

    const out: any[] = [];
    const muted = palette.comment ?? undefined;
    if (nativeHook !== "none") {
        const header = nativeHook === "box" ? label : undefined;
        if (label && !header) out.push(labelNode(label, payload, muted));
        if (!colored && !header) return { nodes: [...out, node], highlighted: false, code };
        out.push({ ...node, [NATIVE_KEY]: nativePayload(colored?.segments ?? [], header) });
        return { nodes: out, highlighted: false, code };
    }

    if (label) out.push(labelNode(label, payload, muted));
    if (colored && colored.segments.length <= MAX_NODES_JS) {
        out.push({ __body: jsNodes(colored.segments, payload) });
        return { nodes: out, highlighted: true, code: colored.text };
    }
    out.push(node);
    return { nodes: out, highlighted: false, code };
}

const isText = (node: any) => node?.type === "text" && typeof node.content === "string";

interface Context {
    markdown?: string;
    messageId: string;
    channelId: string;
    edited: string;
    signature: string;
    palette?: Palette;
    blocks: string[];
    highlighted: boolean[];
}

/** Rewrites the code blocks in `nodes` (and nested quotes), returning a new array if any changed. */
function rewrite(nodes: any[], ctx: Context, depth = 0): any[] {
    if (!Array.isArray(nodes) || depth > 8) return nodes;
    let changed = false;
    const out: any[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node?.type === "codeBlock" && typeof node.content === "string") {
            const index = ctx.blocks.length;
            const key = `${ctx.messageId}:${ctx.edited}:${index}:${ctx.signature}`;
            let cached = nodeCache.get(key);
            if (!cached || cached.code !== node.content) {
                ctx.palette ??= getPalette(settings.palette);
                const payload = { action: TAP_ACTION, messageId: ctx.messageId, messageChannelId: ctx.channelId, block: index };
                const built = buildBlock(node, payload, ctx.palette, ctx.markdown);
                const result: any[] = [];
                for (const part of built.nodes) {
                    if (!part.__body) {
                        result.push(part);
                        continue;
                    }
                    // The native block starts and ends its own lines; a rebuilt one needs line breaks.
                    const prev = result[result.length - 1] ?? out[out.length - 1];
                    if (isText(prev) && !prev.content.endsWith("\n")) result.push(textNode("\n"));
                    result.push(...part.__body);
                    const next = nodes[i + 1];
                    if (next && (!isText(next) || !next.content.startsWith("\n"))) result.push(textNode("\n"));
                }
                nodeCache.set(key, cached = { code: node.content, shown: built.code, nodes: result, highlighted: built.highlighted });
            }
            ctx.blocks.push(cached.shown);
            ctx.highlighted[index] = cached.highlighted;
            if (cached.nodes.length !== 1 || cached.nodes[0] !== node) changed = true;
            out.push(...cached.nodes);
            continue;
        }
        if (node && typeof node === "object" && Array.isArray(node.content) && node.type !== "link") {
            const content = rewrite(node.content, ctx, depth + 1);
            if (content !== node.content) {
                changed = true;
                out.push({ ...node, content });
                continue;
            }
        }
        out.push(node);
    }
    return changed ? out : nodes;
}

/** Settings that change the built nodes, plus the theme (colours are resolved into them). */
function signature() {
    const { highlight, monospace, header, fullName, tapToCopy, palette } = settings;
    return `${+highlight}${+monospace}${+header}${+fullName}${+tapToCopy}${palette}${nativeHook}:${ThemeStore.theme}`;
}

export function patchRows(patcher: Patcher) {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        if (data?.rowType !== MESSAGE_ROW || !Array.isArray(row?.message?.content)) return;
        const message = data.message;
        // Cheap gate: only messages whose text has a fence can hold a code block.
        if (typeof message?.content !== "string" || !message.content.includes("```")) return;
        const ctx: Context = {
            markdown: message.content,
            messageId: String(message.id),
            channelId: String(message.channel_id),
            edited: String(message.editedTimestamp ?? ""),
            signature: signature(),
            blocks: [],
            highlighted: [],
        };
        row.message.content = rewrite(row.message.content, ctx);
        if (ctx.blocks.length) messageBlocks.set(ctx.messageId, { code: ctx.blocks, highlighted: ctx.highlighted });
    });
}

/** Builds one block like the chat would (with or without the native hook), for tests. */
export function previewBlock(lang: string, content: string, native: NativeMode = nativeHook) {
    const palette = getPalette(settings.palette);
    const saved = nativeHook;
    nativeHook = native;
    try {
        // Discord's parser strips ```ansi escape codes from the node; the markdown keeps them.
        const node = { type: "codeBlock", lang, content: stripAnsi(content), inQuote: false };
        return buildBlock(node, { action: TAP_ACTION, block: 0 }, palette, `\`\`\`${lang}\n${content}\`\`\``).nodes;
    } finally {
        nativeHook = saved;
    }
}
