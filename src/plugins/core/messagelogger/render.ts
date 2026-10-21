// Styles logged messages as Discord builds their chat rows (RowManager#generate):
// deleted ones get colored text, a highlight and a "deleted" label; edited ones show
// each previous version above the current content (Discord's own tag marks them edited).

import type { Patcher } from "@/lib/patcher";
import { findByNameLazy } from "@/metro";
import { ReactNative } from "@/metro/common";

import { settings } from "./settings";
import { ZWSP } from "./capture";
import { localUri, type StoredMessage } from "./db";
import { edits, isDeleted, logged } from "./state";

const RowManager = findByNameLazy("RowManager");

const color = (hex: string) => ReactNative.processColor(hex);

/**
 * Wraps content nodes so they render in `hex`. Chat rows have no colored-text node, but
 * links take a color. Discord 348+ reads link styling from a target object; tapping
 * opens the author's profile, like tapping their name.
 */
function colored(content: any[], hex: string, message: any) {
    return {
        type: "link",
        content,
        target: { action: "bindUserMenu", userId: message.author?.id, messageChannelId: message.channel_id, linkColor: color(hex), medium: false },
    };
}

/** Colors the plain text in `nodes`, leaving mentions, links and emoji as they are. */
function colorText(nodes: any[], hex: string, message: any): any[] {
    return nodes.map(node => {
        if (node?.type === "text") return colored([node], hex, message);
        if (Array.isArray(node?.content) && node.type !== "link") return { ...node, content: colorText(node.content, hex, message) };
        return node;
    });
}

const text = (content: string) => ({ type: "text", content });

/** Removes the invisible characters capture.ts adds to force a redraw. */
function stripRedrawMarker(nodes: any[]): any[] {
    return nodes.flatMap(node => {
        if (node?.type !== "text" || typeof node.content !== "string" || !node.content.includes(ZWSP)) return [node];
        const content = node.content.replace(new RegExp(`${ZWSP}+$`), "");
        return content ? [{ ...node, content }] : [];
    });
}

function timeLabel(ms: number) {
    const date = new Date(ms);
    const sameDay = date.toDateString() === new Date().toDateString();
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return sameDay ? time : `${date.toLocaleDateString()} ${time}`;
}

function cloneData(value: any, depth = 0): any {
    if (!value || typeof value !== "object" || depth > 6) return value;
    if (Array.isArray(value)) return value.map(item => cloneData(item, depth + 1));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item, depth + 1)]));
}

/** Replaces every image url string in `node` that `matches` with `local`. */
function replaceUrls(node: any, matches: (url: string) => boolean, local: string, depth = 0) {
    if (!node || typeof node !== "object" || depth > 4) return;
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (typeof value === "string" && /^(https?|file):/.test(value) && matches(value)) node[key] = local;
        else if (value && typeof value === "object") replaceUrls(value, matches, local, depth + 1);
    }
}

/** "cdn.example.com/a/b.png" for "https://cdn.example.com/a/b.png?x=1": what media proxy urls contain. */
const fingerprint = (url: string) => url.replace(/^[a-z]+:\/\//, "").replace(/[?#].*$/, "");

/**
 * Shows the greyed-out copies of a deleted message's images in its row. Attachments are matched
 * by id; embed images by their original url, which media proxy urls contain, or by the saved original.
 */
function swapImages(rowMessage: any, stored: StoredMessage): string[] {
    // The row can share its attachment and embed objects with the message store, which the
    // full-size viewer reads: swap in copies so the viewer keeps the originals.
    if (Array.isArray(rowMessage.attachments)) rowMessage.attachments = rowMessage.attachments.map((a: any) => cloneData(a));
    if (Array.isArray(rowMessage.embeds)) rowMessage.embeds = rowMessage.embeds.map((e: any) => cloneData(e));
    const lost: string[] = [];
    for (const attachment of stored.attachments) {
        if (!attachment.l) {
            // Deleted before it could be saved: the CDN no longer has it, so the tile and the
            // full-size viewer would only show an error. Say so in the message instead.
            if (attachment.x) lost.push(attachment.id);
            continue;
        }
        const target = rowMessage.attachments?.find((a: any) => a?.id === attachment.id);
        if (target) replaceUrls(target, () => true, localUri(attachment.l));
    }
    if (lost.length && Array.isArray(rowMessage.attachments)) {
        rowMessage.attachments = rowMessage.attachments.filter((a: any) => !lost.includes(a?.id));
    }
    for (const embed of stored.embeds ?? []) {
        for (const image of [embed.image, embed.thumbnail]) {
            if (!image?.l) continue;
            const prints = [fingerprint(image.u), image.o && fingerprint(localUri(image.o)), image.o && fingerprint(image.o)].filter(Boolean) as string[];
            for (const rowEmbed of rowMessage.embeds ?? []) {
                for (const part of [rowEmbed?.image, rowEmbed?.thumbnail, rowEmbed?.video]) {
                    replaceUrls(part, url => prints.some(print => url.includes(print)), localUri(image.l));
                }
            }
        }
    }
    return stored.attachments.filter(a => lost.includes(a.id)).map(a => a.f);
}

export function patchRows(patcher: Patcher) {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        if (data?.rowType !== 1 || !row?.message) return;
        const id = data.message?.id;
        if (!id || !logged.has(id)) return;

        if (Array.isArray(row.message.content)) row.message.content = stripRedrawMarker(row.message.content);
        const history = edits.get(id);
        const message = data.message;
        if (history?.length && Array.isArray(row.message.content)) {
            const previous = history.flatMap(edit => [
                colored([text(edit.content || " ")], settings.editedTextColor, message),
                text("\n"),
            ]);
            row.message.content = [...previous, ...row.message.content];
        }

        if (isDeleted(id)) {
            const stored = logged.get(id)!;
            if (Array.isArray(row.message.content)) row.message.content = colorText(row.message.content, settings.deletedTextColor, message);
            row.message.textColor = color(settings.deletedTextColor);
            row.message.edited = settings.showDeleteTime ? `deleted ${timeLabel(stored.deleted_at!)}` : "deleted";
            if (settings.highlightDeleted) {
                row.backgroundHighlight = {
                    ...row.backgroundHighlight,
                    backgroundColor: color(`${settings.highlightColor}22`),
                    gutterColor: color(`${settings.highlightColor}CC`),
                };
            }
            const lost = swapImages(row.message, stored);
            if (lost.length && Array.isArray(row.message.content)) {
                const note = lost.map(name => `🖼 ${name} (deleted before it could be saved)`).join("\n");
                const line = colored([text(note)], settings.deletedTextColor, message);
                row.message.content = row.message.content.length ? [...row.message.content, text("\n"), line] : [line];
            }
        }
    });
}
