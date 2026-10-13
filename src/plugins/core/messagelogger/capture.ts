// Turns deletes into "keep showing it" updates and records edit history, by
// intercepting events on their way into Discord's FluxDispatcher.

import { callNative } from "@/core/bridge";
import { Logger } from "@/lib/logger";
import type { Patcher } from "@/lib/patcher";
import { findByStoreNameLazy } from "@/metro";
import { FluxDispatcher } from "@/metro/common";

import * as db from "./db";
import { settings } from "./settings";
import { deletedByChannel, edits, isDeleted, logged, remember, rememberEdit, snowflakeTime } from "./state";

const logger = new Logger("MessageLogger");
const MessageStore = findByStoreNameLazy("MessageStore");
const ChannelStore = findByStoreNameLazy("ChannelStore");
const UserStore = findByStoreNameLazy("UserStore");

/** Marks events we dispatch ourselves so they pass through untouched. */
export const OWN_EVENT = "__discordiaLogger";

type Listener = (id: string) => void;
const changeListeners = new Set<Listener>();
export const onLoggedChange = (listener: Listener) => (changeListeners.add(listener), () => void changeListeners.delete(listener));
const notify = (id: string) => changeListeners.forEach(listener => listener(id));

function shouldIgnore(message: any): boolean {
    const author = message?.author;
    if (!author?.id) return true;
    if (author.id === "1" || message.state === "SEND_FAILED") return true;
    if (settings.ignoreBots && author.bot) return true;
    if (settings.ignoreSelf && author.id === UserStore.getCurrentUser?.()?.id) return true;
    if (settings.ignoredUsers.includes(author.id)) return true;
    if (settings.ignoredChannels.includes(message.channel_id)) return true;
    const guildId = guildOf(message.channel_id);
    if (guildId && settings.ignoredGuilds.includes(guildId)) return true;
    return false;
}

const guildOf = (channelId: string): string | null => ChannelStore.getChannel?.(channelId)?.guild_id ?? null;

const isImage = (a: any) => /^image\//.test(a.content_type ?? "") || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.filename ?? "");

function toStored(message: any, deletedAt: number | null): db.StoredMessage {
    const author = message.author ?? {};
    const existing = logged.get(message.id);
    return {
        id: message.id,
        channel_id: message.channel_id,
        guild_id: guildOf(message.channel_id),
        author_id: author.id,
        author: { u: author.username ?? "unknown", g: author.globalName ?? author.global_name ?? null, a: author.avatar ?? null, b: !!author.bot || undefined },
        content: message.content ?? "",
        attachments: existing?.attachments.length ? existing.attachments : (message.attachments ?? []).map((a: any) => ({
            id: String(a.id),
            f: a.filename,
            u: a.url,
            p: a.proxy_url !== a.url ? a.proxy_url : undefined,
            w: a.width ?? undefined,
            h: a.height ?? undefined,
            s: a.size ?? undefined,
            t: a.content_type ?? undefined,
        })),
        deleted_at: deletedAt ?? existing?.deleted_at ?? null,
        updated_at: Date.now(),
    };
}

/** Saves greyed-out copies of a deleted message's images, then re-renders it. */
function saveImages(stored: db.StoredMessage) {
    if (!settings.saveImages) return;
    const pending = stored.attachments.filter(a => isImage({ content_type: a.t, filename: a.f }) && !a.l);
    if (!pending.length) return;

    Promise.allSettled(pending.map(async attachment => {
        const result = await callNative<{ uri: string }>(
            "image.cache", attachment.p ?? attachment.u, `logger/images/${attachment.id}.jpg`, { maxSize: 720, quality: 0.7, greyscale: true, alpha: 0.55 });
        attachment.l = result.uri;
    })).then(async results => {
        if (!results.some(r => r.status === "fulfilled")) return;
        await db.setAttachments(stored.id, stored.attachments);
        refresh(stored.id);
    });
}

/** Re-renders a message row by re-dispatching it unchanged. */
export function refresh(id: string) {
    const message = logged.get(id);
    const current = message && MessageStore.getMessage(message.channel_id, id);
    if (!current) return;
    FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message: toPlain(current), [OWN_EVENT]: true });
    notify(id);
}

const toPlain = (message: any) => typeof message?.toJS === "function" ? message.toJS() : { ...message };

/** Handles one deleted message id. Returns an update event that keeps it on screen, or null to let the delete through. */
function handleDelete(channelId: string, id: string, now: number): any | null {
    const message = MessageStore.getMessage(channelId, id);
    if (!message || shouldIgnore(message)) return null;
    if (!message.content && !message.attachments?.length && !message.embeds?.length) return null;

    const stored = toStored(message, now);
    remember(stored);
    db.saveMessage(stored).catch(e => logger.error("Could not save deleted message", e));
    saveImages(stored);
    notify(id);

    if (settings.ignorePluralKit) checkPluralKit(channelId, id);
    return { type: "MESSAGE_UPDATE", message: toPlain(message), [OWN_EVENT]: true };
}

/** PluralKit deletes the original message after proxying it; those deletes aren't interesting. */
function checkPluralKit(channelId: string, id: string) {
    fetch(`https://api.pluralkit.me/v2/messages/${encodeURIComponent(id)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data?.original !== id || data.member?.keep_proxy) return;
            forgetMessage(channelId, id, true);
        })
        .catch(() => { });
}

/** Removes a logged message: from the log and, for deleted ones, from the chat. */
export function forgetMessage(channelId: string, id: string, removeFromChat: boolean) {
    const wasDeleted = isDeleted(id);
    logged.delete(id);
    edits.delete(id);
    deletedByChannel.get(channelId)?.delete(id);
    db.db.batch([["DELETE FROM edits WHERE message_id = ?", [id]], ["DELETE FROM messages WHERE id = ?", [id]]]).catch(() => { });
    if (wasDeleted && removeFromChat) FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id, channelId, [OWN_EVENT]: true });
    else refresh(id);
    notify(id);
}

function handleUpdate(event: any) {
    const next = event.message;
    if (!next?.id || typeof next.content !== "string") return;
    const channelId = next.channel_id ?? event.channelId;
    const previous = MessageStore.getMessage(channelId, next.id);
    // Embed unfurls arrive as updates without a content change.
    if (!previous || previous.content === next.content || shouldIgnore(previous)) return;

    const editedAt = Date.parse(next.edited_timestamp) || Date.now();
    const edit: db.StoredEdit = { message_id: next.id, edited_at: editedAt, content: previous.content ?? "" };
    rememberEdit(edit);
    const stored = { ...toStored(previous, null), content: next.content };
    remember(stored);
    db.saveEdit(stored, edit).catch(e => logger.error("Could not save edit", e));
    notify(next.id);
}

/** Raw API message for a deleted message we only have in the log, used to put it back when its channel loads. */
function toApiMessage(stored: db.StoredMessage) {
    return {
        id: stored.id,
        channel_id: stored.channel_id,
        guild_id: stored.guild_id ?? undefined,
        type: 0,
        content: stored.content,
        author: { id: stored.author_id, username: stored.author.u, global_name: stored.author.g ?? null, avatar: stored.author.a ?? null, discriminator: "0", bot: stored.author.b ?? false },
        timestamp: new Date(snowflakeTime(stored.id)).toISOString(),
        edited_timestamp: null,
        attachments: stored.attachments.map(a => ({ id: a.id, filename: a.f, url: a.u, proxy_url: a.p ?? a.u, width: a.w, height: a.h, size: a.s ?? 0, content_type: a.t })),
        embeds: [],
        mentions: [],
        mention_roles: [],
        mention_everyone: false,
        pinned: false,
        tts: false,
        flags: 0,
        components: [],
    };
}

/** Re-inserts logged deleted messages into a freshly loaded page of messages. */
function handleLoad(event: any) {
    const ids = deletedByChannel.get(event.channelId);
    if (!ids?.size || !Array.isArray(event.messages) || !event.messages.length) return;

    const loaded = event.messages.map((m: any) => m.id as string).sort((a: string, b: string) => a.length - b.length || (a < b ? -1 : 1));
    const oldest = loaded[0];
    const newest = loaded[loaded.length - 1];
    const isLatestPage = !event.hasMoreAfter && !event.isAfter;
    const present = new Set(loaded);

    const extra = [...ids]
        .filter(id => !present.has(id))
        .filter(id => (id.length > oldest.length || (id.length === oldest.length && id >= oldest))
            && (isLatestPage || id.length < newest.length || (id.length === newest.length && id <= newest)))
        .map(id => logged.get(id))
        .filter(Boolean)
        .map(stored => toApiMessage(stored!));
    if (!extra.length) return;

    // The API returns newest first.
    event.messages = [...event.messages, ...extra].sort((a: any, b: any) =>
        b.id.length - a.id.length || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0));
}

export function patchDispatcher(patcher: Patcher) {
    patcher.before("dispatch", FluxDispatcher, ([event]) => {
        if (!event?.type || event[OWN_EVENT]) return;
        try {
            switch (event.type) {
                case "MESSAGE_DELETE": {
                    if (!settings.logDeletes) return;
                    const replacement = handleDelete(event.channelId, event.id, Date.now());
                    return replacement ? [replacement] : undefined;
                }
                case "MESSAGE_DELETE_BULK": {
                    if (!settings.logDeletes || !Array.isArray(event.ids)) return;
                    const now = Date.now();
                    const kept = event.ids.filter((id: string) => handleDelete(event.channelId, id, now) == null);
                    // Logged messages stay in the store unchanged, so re-render them to show them as deleted.
                    const loggedIds = event.ids.filter((id: string) => !kept.includes(id));
                    setTimeout(() => loggedIds.forEach(refresh), 0);
                    return [{ ...event, ids: kept }];
                }
                case "MESSAGE_UPDATE":
                    if (settings.logEdits) handleUpdate(event);
                    return;
                case "LOAD_MESSAGES_SUCCESS":
                    handleLoad(event);
                    return;
            }
        } catch (e) {
            logger.error(`Failed handling ${event.type}`, e);
        }
    });
}
