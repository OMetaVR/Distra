// Hidden messages keep their chat row (author and time stay, so you know what was hidden) but lose
// everything they showed: the text becomes a muted "Hidden message · tap to show" link, and
// attachments, embeds, stickers, components, polls and reactions are dropped from the row data.
// Tapping the link (or "Show Message" in the long-press menu) brings the message back. Replies to a
// hidden message quote "Hidden message" instead of its text.

import { Logger } from "@/lib/logger";
import type { Patcher } from "@/lib/patcher";
import { findByFilePath, findByNameLazy } from "@/metro";
import { ReactNative, ThemeStore } from "@/metro/common";
import { resolveSemanticColor, semanticColors } from "@/ui/color";

import { isHidden } from "./store";

const logger = new Logger("HideMessages");
const RowManager = findByNameLazy("RowManager");

/** Link action of the placeholder; handleMessagesTapLink hands it back to us. */
export const SHOW_ACTION = "distraShowHiddenMessage";

const LIST_FIELDS = ["attachments", "embeds", "stickers", "components", "giftCodes", "codedLinks", "reactions", "postPreviewEmbeds"];
const OBJECT_FIELDS = [
    "pollData", "threadEmbed", "forwardInfo", "activityInstanceEmbed", "activityRichPresenceInviteEmbed",
    "safetyPolicyNoticeEmbed", "safetySystemNotificationEmbed", "executedCommand", "interactionStatus",
];

function mutedColor(theme?: string) {
    const hex = resolveSemanticColor(semanticColors.TEXT_MUTED, theme ?? ThemeStore?.theme) ?? resolveSemanticColor(semanticColors.TEXT_MUTED);
    return hex ? ReactNative.processColor(hex) : undefined;
}

function placeholder(message: any, theme?: string) {
    return [{
        type: "link",
        content: [{ type: "text", content: "Hidden message · tap to show" }],
        target: { action: SHOW_ACTION, messageId: message.id, messageChannelId: message.channel_id, linkColor: mutedColor(theme), medium: false },
    }];
}

export function patchRows(patcher: Patcher) {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        if (data?.rowType !== 1 || !row?.message) return;
        // Replies to a hidden message don't quote it either.
        const quoted = row.message.referencedMessage?.message;
        if (quoted?.id && isHidden(quoted.id)) {
            row.message.referencedMessage = { ...row.message.referencedMessage, message: { ...quoted, content: [{ type: "text", content: "Hidden message" }] } };
            for (const field of LIST_FIELDS) if (Array.isArray(quoted[field])) row.message.referencedMessage.message[field] = [];
        }
        if (!isHidden(data.message?.id)) return;
        const rowMessage = row.message;
        for (const field of LIST_FIELDS) if (Array.isArray(rowMessage[field])) rowMessage[field] = [];
        for (const field of OBJECT_FIELDS) if (rowMessage[field] != null) rowMessage[field] = undefined;
        rowMessage.content = placeholder(data.message, row.forcedTheme);
        rowMessage.edited = undefined;
    });
}

/** Taps on the placeholder link show the message again. */
export function patchTaps(patcher: Patcher, show: (id: string, channelId: string) => void) {
    const module = findByFilePath("modules/messages/native/handlers/handleMessagesTapLink.tsx");
    if (typeof module?.handleMessagesTapLink !== "function") {
        return logger.warn("Link tap handler not found; use Show Message in the long-press menu instead");
    }
    patcher.instead("handleMessagesTapLink", module, (args: any[], original: (...a: any[]) => any) => {
        const data = args[0]?.tapLinkData?.data;
        if (data?.action !== SHOW_ACTION) return original(...args);
        const message = args[0]?.message;
        show(data.messageId ?? message?.id, data.messageChannelId ?? message?.channel_id);
    });
}
