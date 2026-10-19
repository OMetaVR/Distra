// WhoReacted: small avatars of the people who reacted, inside each reaction pill after the count.
// Port of Vencord's WhoReacted (GPL-3.0-or-later, by Vendicated, KannaDev and newwares) for iOS.
// Pills are drawn natively from row data whose ReactionModel has no field for users, so each chat
// row gets `message.distraReactors` (avatar URLs per reaction) and the tweak (DSTReactions.m) adds
// the avatars to Discord's own pill view. Tweaks without that hook can show a names line instead
// ("🗿 Alice, Bob +3" at the end of the message; tapping it opens Discord's reactions sheet).

import { callNative } from "@/core/bridge";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { redrawMessages } from "@/lib/rowRedraw";
import { findByFilePath, findByNameLazy, findByProps, findByStoreName } from "@/metro";
import { ReactNative, ThemeStore } from "@/metro/common";
import { resolveSemanticColor, semanticColors } from "@/ui/color";

import { definePlugin } from "../types";
import { emojiKey, reactorsOf, requestReactors, resetReactors } from "./reactors";
import SettingsPage from "./SettingsPage";
import { loadSettings, nativeStatus, settings } from "./settings";

const logger = new Logger("WhoReacted");
let patcher = createPatcher("WhoReacted");

const RowManager = findByNameLazy("RowManager");
const UserStore = findByStoreName("UserStore");
const ChannelStore = findByStoreName("ChannelStore");
const GuildMemberStore = findByStoreName("GuildMemberStore");
const MessageStore = findByStoreName("MessageStore");
const SelectedChannelStore = findByStoreName("SelectedChannelStore");

const TAP_ACTION = "distraWhoReacted";
const NORMAL = 0;
const BURST = 1;
/** Avatar diameter and overlap in points (the tweak's defaults too). */
const AVATAR_SIZE = 16;
const AVATAR_OVERLAP = 5;

async function enableNative() {
    try {
        const info: any = await Promise.race([
            callNative("reactions.enable"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 5000)),
        ]);
        Object.assign(nativeStatus, { checked: true, installed: info?.installed === true, info, error: undefined });
        if (!nativeStatus.installed) logger.warn("Tweak can't draw reactor avatars; missing", info?.missing);
    } catch (e: any) {
        Object.assign(nativeStatus, { checked: true, installed: false, error: String(e?.message ?? e) });
        logger.info("Tweak has no reactor avatars (needs a newer Distra tweak)", nativeStatus.error);
    }
    return nativeStatus.installed;
}

function displayName(user: any, guildId: string | undefined, me: string | undefined) {
    if (user.id === me) return "You";
    return (guildId && GuildMemberStore?.getNick?.(guildId, user.id)) || user.globalName || user.global_name || user.username || "Unknown";
}

function avatarUrl(user: any, guildId: string | undefined) {
    const memberAvatar = guildId ? GuildMemberStore?.getMember?.(guildId, user.id)?.avatar : undefined;
    if (memberAvatar) return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${memberAvatar}.png?size=64`;
    if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
    let index = 0;
    try {
        const discriminator = Number(user.discriminator ?? 0);
        index = discriminator ? discriminator % 5 : Number((BigInt(user.id) >> BigInt(22)) % BigInt(6));
    } catch { }
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

// Rows of messages whose reactors just arrived, redrawn together.
const dirty = new Map<string, Set<string>>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRedraw(channelId: string, messageId: string) {
    const ids = dirty.get(channelId) ?? new Set<string>();
    ids.add(messageId);
    dirty.set(channelId, ids);
    // At most one redraw per interval, however steadily reactors keep arriving.
    flushTimer ??= setTimeout(() => {
        flushTimer = undefined;
        for (const [channel, list] of dirty) redrawMessages(channel, list);
        dirty.clear();
    }, 200);
}

/** Known reactors of one kind of reaction (normal or burst), you first; fetches missing ones. */
function usersFor(message: any, reaction: any, type: number, wanted: number, me: string | undefined, order = 0) {
    const details = reaction.count_details ?? {};
    const count = Number(type === BURST ? details.burst ?? reaction.burst_count : details.normal ?? reaction.count) || 0;
    if (count <= 0) return [];
    const users = new Map<string, any>();
    const reactedMyself = type === BURST ? reaction.me_burst || reaction.burst_me : reaction.me;
    const currentUser = reactedMyself && me ? UserStore?.getUser?.(me) ?? UserStore?.getCurrentUser?.() : undefined;
    if (currentUser) users.set(currentUser.id, currentUser);
    for (const user of reactorsOf(message.channel_id, message.id, reaction.emoji, type)) if (user?.id) users.set(user.id, user);
    if (users.size < Math.min(count, wanted) && settings.fetchReactors) {
        requestReactors(message.channel_id, message.id, reaction.emoji, type, wanted, order, () => scheduleRedraw(message.channel_id, message.id));
    }
    return [...users.values()];
}

const sameEmoji = (a: any, b: any) => (a?.id ? a.id === b?.id : !b?.id && a?.name === b?.name);

/** `message.distraReactors`: avatar URLs per row reaction, in the row's order (see DSTReactions.m). */
function reactorPayload(message: any, rowReactions: any[], guildId: string | undefined, me: string | undefined) {
    const max = Math.max(1, settings.maxAvatars);
    let any = false;
    const entries = rowReactions.map((drawn, order) => {
        const reaction = message.reactions.find((r: any) => sameEmoji(r.emoji, drawn.emoji));
        const urls = (type: number) => reaction ? usersFor(message, reaction, type, max, me, order).slice(0, max).map(user => avatarUrl(user, guildId)) : [];
        const entry = { c: drawn.count, n: urls(NORMAL), b: urls(BURST) };
        any ||= entry.n.length > 0 || entry.b.length > 0;
        return entry;
    });
    return any ? { s: AVATAR_SIZE, o: AVATAR_OVERLAP, r: entries } : null;
}

/** "Alice, Bob +3" for a reaction, or null while nobody is known yet. */
function namesFor(message: any, reaction: any, guildId: string | undefined, me: string | undefined) {
    const details = reaction.count_details ?? {};
    const total = Number(reaction.count ?? 0) || Number(details.normal ?? 0) + Number(details.burst ?? 0);
    const users = new Map<string, any>();
    for (const type of [NORMAL, BURST]) for (const user of usersFor(message, reaction, type, settings.maxNames, me)) users.set(user.id, user);
    if (!users.size) return null;
    const list = [...users.values()].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));
    const shown = list.slice(0, Math.max(1, settings.maxNames)).map(user => displayName(user, guildId, me));
    const more = Math.max(total, list.length) - shown.length;
    return `${shown.join(", ")}${more > 0 ? ` +${more}` : ""}`;
}

function emojiNode(reaction: any, rowReactions: any[]) {
    const emoji = reaction.emoji ?? {};
    if (!emoji.id) return { type: "text", content: emoji.name ?? "" };
    const drawn = rowReactions.find(r => r?.emoji?.id === emoji.id);
    const src = drawn?.emoji?.src || `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "webp"}?size=48`;
    return { type: "customEmoji", id: emoji.id, alt: emoji.name ?? "emoji", src, frozenSrc: src.replace(/\.gif(\?|$)/, ".webp$1") };
}

function mutedColor(theme?: string) {
    const hex = resolveSemanticColor(semanticColors.TEXT_MUTED, theme ?? ThemeStore?.theme);
    return hex ? ReactNative.processColor(hex) : undefined;
}

function addNamesLine(row: any, message: any, guildId: string | undefined, me: string | undefined) {
    const linkColor = mutedColor(row.forcedTheme);
    const nodes: any[] = [];
    for (const reaction of message.reactions) {
        const names = namesFor(message, reaction, guildId, me);
        if (!names) continue;
        if (nodes.length) nodes.push({ type: "text", content: "   " });
        nodes.push(emojiNode(reaction, row.message.reactions), {
            type: "link",
            content: [{ type: "text", content: ` ${names}` }],
            target: {
                action: TAP_ACTION,
                messageId: message.id,
                messageChannelId: message.channel_id,
                emojiId: reaction.emoji?.id ?? null,
                emojiName: reaction.emoji?.name ?? null,
                emojiAnimated: !!reaction.emoji?.animated,
                linkColor,
                medium: false,
            },
        });
    }
    if (!nodes.length) return;
    const content = row.message.content;
    row.message.content = content.length ? [...content, { type: "text", content: "\n" }, ...nodes] : nodes;
}

function patchRows() {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        if (data?.rowType !== 1 || !row?.message) return;
        const message = data.message;
        const reactions: any[] = message?.reactions ?? [];
        // Rows other plugins emptied of reactions (hidden messages) stay as they are.
        if (!reactions.length || reactions.length > settings.maxReactions || !row.message.reactions?.length) return;

        const me = UserStore?.getCurrentUser?.()?.id;
        const guildId = ChannelStore?.getChannel?.(message.channel_id)?.guild_id;
        if (nativeStatus.installed) {
            const payload = reactorPayload(message, row.message.reactions, guildId, me);
            if (payload) row.message.distraReactors = payload;
        }
        if (settings.namesLine && Array.isArray(row.message.content)) addNamesLine(row, message, guildId, me);
    });
}

/** Tapping the names opens Discord's reactions sheet on that emoji. */
function patchTaps() {
    const module = findByFilePath("modules/messages/native/handlers/handleMessagesTapLink.tsx");
    const ReactionUtils = findByProps("handleViewReactions");
    if (typeof module?.handleMessagesTapLink !== "function") return logger.warn("Link tap handler not found; tapping reactor names does nothing");
    patcher.instead("handleMessagesTapLink", module, (args: any[], original: (...a: any[]) => any) => {
        const data = args[0]?.tapLinkData?.data;
        if (data?.action !== TAP_ACTION) return original(...args);
        const emoji = { id: data.emojiId ?? null, name: data.emojiName, animated: !!data.emojiAnimated };
        ReactionUtils?.handleViewReactions?.({ channelId: data.messageChannelId, messageId: data.messageId, emoji });
    });
}

/** Redraws the open channel's messages with reactions (after the tweak hook comes up). */
function redrawOpenChannel() {
    const channelId = SelectedChannelStore?.getChannelId?.();
    const messages: any[] = channelId ? MessageStore?.getMessages?.(channelId)?._array ?? [] : [];
    const ids = messages.filter(m => m?.reactions?.length).map(m => m.id);
    if (ids.length) redrawMessages(channelId, ids);
}

export default definePlugin({
    id: "distra:who-reacted",
    manifest: {
        name: "WhoReacted",
        description: "Shows the avatars of the people who reacted inside each reaction pill.",
        authors: [{ name: "Distra" }, { name: "Vendicated, KannaDev, newwares (Vencord WhoReacted)" }],
        version: "2.0.0",
    },

    async start() {
        await loadSettings();
        patcher = createPatcher("WhoReacted");
        patchRows();
        patchTaps();
        void enableNative().then(installed => installed && redrawOpenChannel());
    },

    stop() {
        patcher.unpatchAll();
        clearTimeout(flushTimer);
        flushTimer = undefined;
        dirty.clear();
        resetReactors();
        redrawOpenChannel();
    },

    SettingsComponent: SettingsPage,
    api: { reactorsOf, emojiKey, nativeStatus },
});
