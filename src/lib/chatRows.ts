// Helpers for plugins that decorate chat rows. iOS draws chat rows natively from the row data
// RowManager#generate builds; plugins after-patch it and edit only the parts they own, so
// several of them can decorate the same row.

import type { Patcher } from "@/lib/patcher";
import { findByNameLazy, findByProps } from "@/metro";
import { ReactNative } from "@/metro/common";

export const RowManager = findByNameLazy("RowManager");

/** `data.rowType` of message rows. */
export const MESSAGE_ROW = 1;

/** Message types drawn with an author header (default, reply, slash command, context menu command). */
export const isUserMessage = (type: unknown) => type == null || type === 0 || type === 19 || type === 20 || type === 23;

export const nativeColor = (color: string) => ReactNative.processColor(color) as unknown as number;

/** A text node. */
export const textNode = (content: string) => ({ type: "text", content });

/**
 * Content nodes drawn in `color`. Rows have no colored-text node, but links take a color from
 * their target object. `payload` ends up in the tap event, so a tap interceptor can recognise it.
 */
export function coloredNode(content: any[], color: string, payload: Record<string, unknown>) {
    return { type: "link", content, target: { ...payload, linkColor: nativeColor(color), medium: false } };
}

// Nodes whose text is not plain message text (or is drawn by its own renderer).
const OPAQUE = new Set([
    "link", "mention", "channelMention", "commandMention", "gameMention", "staticChannelMention", "attachmentLink",
    "timestamp", "codeBlock", "inlineCode", "customEmoji", "emoji", "soundboard", "channelName", "guildName",
]);

/** Rewrites the plain text nodes of a row's content (returns new arrays; nodes it doesn't change are reused). */
export function mapTextNodes(nodes: any[], map: (node: any) => any[] | undefined, depth = 0): any[] {
    if (!Array.isArray(nodes) || depth > 12) return nodes;
    let changed = false;
    const out = nodes.flatMap(node => {
        if (node?.type === "text" && typeof node.content === "string") {
            const replaced = map(node);
            if (replaced) {
                changed = true;
                return replaced;
            }
            return [node];
        }
        if (!node || typeof node !== "object" || OPAQUE.has(node.type)) return [node];
        let next = node;
        if (Array.isArray(node.content)) {
            const content = mapTextNodes(node.content, map, depth + 1);
            if (content !== node.content) next = { ...next, content };
        }
        if (Array.isArray(node.items)) {
            const items = node.items.map((item: any) => mapTextNodes(item, map, depth + 1));
            if (items.some((item: any, i: number) => item !== node.items[i])) next = { ...next, items };
        }
        if (next !== node) changed = true;
        return [next];
    });
    return changed ? out : nodes;
}

/**
 * Rewrites any nodes of a row's content: `map` returns a replacement node, or undefined to keep
 * the node (its children are then visited). Returns new arrays only where something changed.
 */
export function mapNodes(nodes: any[], map: (node: any) => any, depth = 0): any[] {
    if (!Array.isArray(nodes) || depth > 12) return nodes;
    let changed = false;
    const out = nodes.map(node => {
        if (!node || typeof node !== "object") return node;
        const replaced = map(node);
        if (replaced !== undefined && replaced !== node) {
            changed = true;
            return replaced;
        }
        if (!Array.isArray(node.content)) return node;
        const content = mapNodes(node.content, map, depth + 1);
        if (content === node.content) return node;
        changed = true;
        return { ...node, content };
    });
    return changed ? out : nodes;
}

/** Calls `visit` on every node of a row's content, including nested ones. */
export function forEachNode(nodes: any[], visit: (node: any) => void, depth = 0) {
    if (!Array.isArray(nodes) || depth > 12) return;
    for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        visit(node);
        if (Array.isArray(node.content)) forEachNode(node.content, visit, depth + 1);
        if (Array.isArray(node.items)) node.items.forEach((item: any) => forEachNode(item, visit, depth + 1));
    }
}

/**
 * Intercepts a chat tap handler (`handleTapLink`, `handleTapEmoji`, ...). Discord creates a
 * MessagesHandlers object per open chat, with the handlers as own properties; new ones get
 * the interceptor (reopen a chat after enabling). `intercept` returns true when it handled the tap.
 */
export function interceptChatTap(patcher: Patcher, handler: string, isActive: () => boolean, intercept: (event: any) => boolean) {
    const module = findByProps("MessagesHandlers");
    if (typeof module?.MessagesHandlers !== "function") return false;
    patcher.after("MessagesHandlers", module, (_args: any[], instance: any) => {
        const original = instance?.[handler];
        if (typeof original !== "function") return;
        instance[handler] = function (this: unknown, ...args: any[]) {
            try {
                if (isActive() && intercept(args[0]?.nativeEvent)) return;
            } catch (e) {
                console.error(`[Distra] ${handler} interceptor threw`, e);
            }
            return original.apply(this, args);
        };
    });
    return true;
}
