// Show Badges In Chat: the author's badges (Discord profile badges, Nitro, Global Badges) on their
// messages. Ported from Vencord's ShowBadgesInChat (Inbestigator, KrystalSkull).
// Chat rows are native and their header has one image slot (the role icon). With the tweak's
// header hook (tweak/Sources/DSTHeaderBadges.m) rows carry `message.distraBadges` and the badges
// are drawn after the name and timestamp, wrapping onto a second header line when they don't fit.
// Without it (older tweaks) they are inline images on their own line above the message text.
// Optionally the first badge takes the role icon spot next to the name when the author has none.
// Rows are rewritten as Discord builds them (RowManager#generate). Tapping a badge shows its name.

import { callNative } from "@/core/bridge";
import { interceptChatTap, isUserMessage, MESSAGE_ROW, RowManager, textNode } from "@/lib/chatRows";
import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { showToast } from "@/ui/toasts";

import { definePlugin } from "../types";
import { badgesFor, type ChatBadge } from "./badges";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings, state } from "./settings";

const BADGE_ID = "distra-badge:";
const ROLE_ICON_SIZE = 18;

const logger = new Logger("ShowBadgesInChat");
let patcher = createPatcher("ShowBadgesInChat");
let running = false;

async function enableNativeHeader() {
    try {
        const info = await Promise.race([
            callNative<{ hooked?: boolean; missing?: string[] }>("headerBadges.enable"),
            new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 3000)),
        ]);
        logger.info("Native header badges:", JSON.stringify(info ?? "no answer"));
        return info?.hooked === true;
    } catch (e) {
        logger.info("No native header badges; badges go on their own line above the message:", (e as Error)?.message ?? String(e));
        return false;
    }
}

const badgeNode = (badge: ChatBadge) => ({
    type: "customEmoji",
    id: `${BADGE_ID}${badge.label}`,
    alt: badge.label,
    src: badge.url,
    frozenSrc: badge.url,
    jumboable: false,
});

/** Badges as inline images on their own line above the message text. */
function prependLine(message: any, badges: ChatBadge[]) {
    const content = Array.isArray(message.content) ? message.content : [];
    const line = badges.flatMap((badge, i) => i ? [textNode(" "), badgeNode(badge)] : [badgeNode(badge)]);
    message.content = content.length ? [...line, textNode("\n"), ...content] : line;
}

function decorate(row: any) {
    const message = row.message;
    if (!message.isFirst || !message.authorId || !isUserMessage(message.type)) return;
    const badges = badgesFor(message.authorId);
    if (!badges.length) return;

    let rest = badges;
    if (settings.placement === "name" && message.roleIcon == null) {
        const [first, ...others] = badges;
        // Tapping a role icon shows a toast with its name and image, which suits a badge too.
        message.roleIcon = { source: first.url, name: first.label, size: ROLE_ICON_SIZE, alt: first.label };
        rest = others;
    }
    if (!rest.length) return;
    if (state.nativeHeader && settings.placement !== "text") {
        message.distraBadges = rest.map(badge => ({ url: badge.url, label: badge.label }));
    } else {
        prependLine(message, rest);
    }
}

const badgeLabel = (event: any): string | undefined => {
    const id = event?.node?.id ?? event?.id ?? event?.emojiId;
    return typeof id === "string" && id.startsWith(BADGE_ID) ? id.slice(BADGE_ID.length) : undefined;
};

export default definePlugin({
    id: "distra:show-badges-in-chat",
    manifest: {
        name: "Show Badges In Chat",
        description: "Shows the author's badges (Discord, Nitro, Global Badges) next to their name on their messages.",
        authors: [{ name: "Distra" }, { name: "Inbestigator" }, { name: "KrystalSkull" }],
        version: "1.1.0",
    },

    async start() {
        await loadSettings();
        state.nativeHeader = await enableNativeHeader();
        patcher = createPatcher("ShowBadgesInChat");
        running = true;
        patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
            if (data?.rowType === MESSAGE_ROW && row?.message) decorate(row);
        });
        interceptChatTap(patcher, "handleTapEmoji", () => running, event => {
            const label = badgeLabel(event);
            if (!label) return false;
            const src = event?.node?.src;
            showToast(label, typeof src === "string" ? { uri: src } as any : findAssetId("ic_badge_staff"));
            return true;
        });
    },

    stop() {
        running = false;
        patcher.unpatchAll();
        if (state.nativeHeader) callNative("headerBadges.clear").catch(() => { });
        state.nativeHeader = false;
    },

    SettingsComponent: SettingsPage,

    api: { badgesFor, isNativeHeader: () => state.nativeHeader },
});
