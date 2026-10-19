// Custom Timestamps: your own formats for message timestamps (moment tokens, [calendar] with
// Today / Yesterday / Last week / Older formats, [relative]). Port of Equicord's CustomTimestamps
// (GPL-3.0-or-later). Chat rows are native views built from row data, so the strings Discord puts
// in a message row (RowManager#generate) are replaced: the header time, the full date shown on tap,
// the edited time and the screen reader label, plus the tap text of <t:…> timestamps in messages.

import { createPatcher } from "@/lib/patcher";
import { setRowTimestamp } from "@/lib/rowTimestamp";
import { findByNameLazy } from "@/metro";

import { definePlugin } from "../types";
import { format, formatAs } from "./format";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";

const RowManager = findByNameLazy("RowManager");
let patcher = createPatcher("CustomTimestamps");

const toDate = (value: any): Date | undefined => {
    if (value == null) return undefined;
    const date = new Date(typeof value === "object" ? +value : value);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Gives <t:…> nodes in row content the "full date" format (new nodes; the parse may be cached). */
function rewriteMarkdownTimestamps(nodes: any[]): any[] {
    let changed = false;
    const next = nodes.map(node => {
        if (node?.type === "timestamp" && node.timestamp != null) {
            const date = toDate(Number(node.timestamp) * 1000);
            if (!date) return node;
            changed = true;
            return { ...node, full: formatAs(date, "tooltip") };
        }
        if (Array.isArray(node?.content)) {
            const content = rewriteMarkdownTimestamps(node.content);
            if (content !== node.content) {
                changed = true;
                return { ...node, content };
            }
        }
        return node;
    });
    return changed ? next : nodes;
}

function patchRows() {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        const rowMessage = row?.message;
        if (data?.rowType !== 1 || !rowMessage) return;
        const sent = toDate(data.message?.timestamp);
        if (sent) {
            if (typeof rowMessage.timestamp === "string") setRowTimestamp(rowMessage, formatAs(sent, "header"));
            if (typeof rowMessage.timestampTooltip === "string") rowMessage.timestampTooltip = formatAs(sent, "tooltip");
            if (typeof rowMessage.timestampAccessibilityLabel === "string") rowMessage.timestampAccessibilityLabel = formatAs(sent, "accessibility");
        }
        const edited = toDate(data.message?.editedTimestamp);
        if (edited && typeof rowMessage.editedTimestamp === "string") rowMessage.editedTimestamp = formatAs(edited, "tooltip");
        if (settings.markdownTimestamps && Array.isArray(rowMessage.content)) rowMessage.content = rewriteMarkdownTimestamps(rowMessage.content);
    });
}

export default definePlugin({
    id: "distra:custom-timestamps",
    manifest: {
        name: "Custom Timestamps",
        description: "Your own formats for message timestamps: Today / Yesterday / older dates, relative times, seconds, 24-hour time and more.",
        authors: [{ name: "Distra" }, { name: "Rini, nvhhr, Suffocate, Obsidian (Equicord CustomTimestamps)" }],
        version: "1.0.0",
    },
    async start() {
        await loadSettings();
        patcher = createPatcher("CustomTimestamps");
        patchRows();
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
    api: { format, formatAs },
});
