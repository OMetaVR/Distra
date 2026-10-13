// Styles logged messages as Discord builds their chat rows (RowManager#generate):
// deleted ones get colored text, a highlight and a "deleted" label; edited ones show
// each previous version above the current content.

import type { Patcher } from "@/lib/patcher";
import { findByNameLazy } from "@/metro";
import { ReactNative } from "@/metro/common";

import { settings } from "./settings";
import { edits, isDeleted, logged } from "./state";

const RowManager = findByNameLazy("RowManager");

const color = (hex: string) => ReactNative.processColor(hex);

/**
 * Wraps content nodes so they render in `hex`. Chat rows have no colored-text node, but
 * links take a color, so the content becomes a link that does nothing when tapped.
 */
function colored(content: any[], hex: string) {
    return {
        type: "link",
        content,
        target: "usernameOnClick",
        context: { username: 1, medium: true, usernameOnClick: { linkColor: color(hex) } },
    };
}

const text = (content: string) => ({ type: "text", content });

function timeLabel(ms: number) {
    const date = new Date(ms);
    const sameDay = date.toDateString() === new Date().toDateString();
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return sameDay ? time : `${date.toLocaleDateString()} ${time}`;
}

/**
 * Points image urls of a deleted message's attachments at their greyed-out local copies.
 * CDN and media-proxy urls carry signatures and resize parameters, so they're matched
 * by the attachment id path segment (`/attachments/<channel>/<id>/<file>`).
 */
function swapImages(node: any, localById: Map<string, string>, depth = 0) {
    if (!node || typeof node !== "object" || depth > 6) return;
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (typeof value === "string" && value.startsWith("http")) {
            for (const [id, local] of localById) {
                if (value.includes(`/${id}/`)) {
                    node[key] = local;
                    break;
                }
            }
        } else if (value && typeof value === "object") {
            swapImages(value, localById, depth + 1);
        }
    }
}

export function patchRows(patcher: Patcher) {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        if (data?.rowType !== 1 || !row?.message) return;
        const id = data.message?.id;
        if (!id || !logged.has(id)) return;

        const history = edits.get(id);
        if (history?.length && Array.isArray(row.message.content)) {
            const previous = history.flatMap(edit => [
                colored([text(edit.content || " ")], settings.editedTextColor),
                colored([text(" (edited)")], settings.editedTextColor),
                text("\n"),
            ]);
            row.message.content = [...previous, ...row.message.content];
        }

        if (isDeleted(id)) {
            const stored = logged.get(id)!;
            if (Array.isArray(row.message.content)) row.message.content = [colored(row.message.content, settings.deletedTextColor)];
            row.message.edited = settings.showDeleteTime ? `deleted ${timeLabel(stored.deleted_at!)}` : "deleted";
            if (settings.highlightDeleted) {
                row.backgroundHighlight = {
                    ...row.backgroundHighlight,
                    backgroundColor: color(`${settings.highlightColor}22`),
                    gutterColor: color(`${settings.highlightColor}CC`),
                };
            }
            const localById = new Map(stored.attachments.filter(a => a.l).map(a => [a.id, a.l!]));
            if (localById.size) swapImages(row.message, localById);
        }
    });
}
