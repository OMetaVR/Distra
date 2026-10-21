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
export const OWN_EVENT = "__distraLogger";

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
        embeds: existing?.embeds?.length ? existing.embeds : toStoredEmbeds(message.embeds),
        deleted_at: deletedAt ?? existing?.deleted_at ?? null,
        updated_at: Date.now(),
    };
}

const embedImage = (image: any): db.StoredEmbedImage | undefined => image?.url ? {
    u: image.url,
    p: (image.proxyURL ?? image.proxy_url) !== image.url ? image.proxyURL ?? image.proxy_url : undefined,
    w: image.width ?? undefined,
    h: image.height ?? undefined,
} : undefined;

/** Message records keep embeds in Discord's client format; this keeps what's needed to show them again. */
function toStoredEmbeds(embeds: any[] | undefined): db.StoredEmbed[] | undefined {
    if (!embeds?.length) return undefined;
    return embeds.map(embed => ({
        t: embed.type ?? "rich",
        url: embed.url ?? undefined,
        title: embed.rawTitle ?? embed.title ?? undefined,
        description: embed.rawDescription ?? embed.description ?? undefined,
        color: typeof embed.color === "number" ? embed.color : undefined,
        author: embed.author?.name ? { name: embed.author.name, url: embed.author.url, icon_url: embed.author.iconURL ?? embed.author.icon_url } : undefined,
        footer: embed.footer?.text ? { text: embed.footer.text, icon_url: embed.footer.iconURL ?? embed.footer.icon_url } : undefined,
        fields: embed.fields?.length ? embed.fields.map((f: any) => ({ name: f.rawName ?? f.name, value: f.rawValue ?? f.value, inline: f.inline })) : undefined,
        image: embedImage(embed.image),
        thumbnail: embedImage(embed.thumbnail),
    }));
}

/** Simple string hash, for naming saved embed images. */
function hashKey(text: string) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) hash = (hash * 33) ^ text.charCodeAt(i);
    return (hash >>> 0).toString(36);
}

/** Every image of a stored message with the key its files are saved under. */
function imagesOf(stored: db.StoredMessage) {
    const images: { key: string; sources: string[]; target: db.StoredAttachment | db.StoredEmbedImage }[] = [];
    for (const a of stored.attachments) {
        // The media proxy often keeps serving a deleted attachment after the CDN stops.
        if (isImage({ content_type: a.t, filename: a.f })) images.push({ key: a.id, sources: [...new Set([a.u, a.p].filter(Boolean) as string[])], target: a });
    }
    for (const embed of stored.embeds ?? []) {
        for (const image of [embed.image, embed.thumbnail]) {
            if (image) images.push({ key: `e${hashKey(image.u)}`, sources: [...new Set([image.p, image.u].filter(Boolean) as string[])], target: image });
        }
    }
    return images;
}

/**
 * Saves two copies of each image in a deleted message: a small greyed-out one shown in the
 * chat and a recompressed original for the full-size viewer (Discord's CDN stops serving a
 * deleted message's attachments). Then redraws the message with them.
 */
const imageAttempts = new Set<string>();

function saveImages(stored: db.StoredMessage) {
    if (!settings.saveImages || imageAttempts.has(stored.id)) return;
    imageAttempts.add(stored.id);
    const pending = imagesOf(stored).filter(image => (!image.target.l || !image.target.o) && !image.target.x);
    if (!pending.length) return;

    Promise.allSettled(pending.map(async ({ key, sources, target }) => {
        let gone = 0;
        for (const source of sources) {
            try {
                // Same url for both, so the second request is served from the HTTP cache.
                const grey = await callNative<{ uri: string }>("image.cache", source, db.imagePath(key), { maxSize: 720, quality: 0.6, greyscale: true, alpha: 0.75 });
                target.l = grey.uri;
                const original = await callNative<{ uri: string }>("image.cache", source, db.imagePath(key, "o"), { maxSize: 2048, quality: 0.8 });
                target.o = original.uri;
                return;
            } catch (e) {
                if (/HTTP 40[34]/.test(String(e))) gone++;
                if (source === sources[sources.length - 1]) {
                    // Gone everywhere: remember, so it isn't requested again on every launch.
                    if (gone === sources.length) target.x = true;
                    throw e;
                }
            }
        }
    })).then(async results => {
        const failed = results.filter(r => r.status === "rejected");
        if (failed.length) logger.warn(`Could not save ${failed.length} image(s) of ${stored.id}`, (failed[0] as PromiseRejectedResult).reason);
        if (failed.length === results.length) {
            if (imagesOf(stored).some(image => image.target.x)) {
                await db.setMedia(stored);
                refresh(stored.id);
            }
            return;
        }
        await db.setMedia(stored);
        refresh(stored.id);
    });
}

/** API-format attachments and embeds pointing at the saved originals, so the full-size viewer opens those. */
function localMedia(stored: db.StoredMessage | undefined) {
    if (!stored || ![...stored.attachments, ...(stored.embeds ?? []).flatMap(e => [e.image, e.thumbnail])].some(item => item?.o || item?.x)) return {};
    return { attachments: toApiAttachments(stored), embeds: toApiEmbeds(stored) };
}

// Images that were gone before they could be saved are left out (the row says so instead); ones
// whose original couldn't be saved open the greyed-out copy rather than a dead CDN link.
const toApiAttachments = (stored: db.StoredMessage) => stored.attachments.filter(a => !(a.x && !a.o && !a.l)).map(a => ({
    id: a.id, filename: a.f, url: savedOriginal(a) ?? a.u, proxy_url: savedOriginal(a) ?? a.p ?? a.u, width: a.w, height: a.h, size: a.s ?? 0, content_type: a.t,
}));

const savedOriginal = (item: { o?: string; l?: string; x?: boolean }) => db.localUri(item.o ?? (item.x ? item.l : undefined));

const toApiImage = (image: db.StoredEmbedImage | undefined) => image && ({ url: savedOriginal(image) ?? image.u, proxy_url: savedOriginal(image) ?? image.p ?? image.u, width: image.w, height: image.h });

const toApiEmbeds = (stored: db.StoredMessage) => (stored.embeds ?? []).map(e => ({
    type: e.t, url: e.url, title: e.title, description: e.description, color: e.color, author: e.author, footer: e.footer, fields: e.fields,
    image: toApiImage(e.image), thumbnail: toApiImage(e.thumbnail),
}));

export const ZWSP = "\u200b";

/**
 * Update events that make the chat redraw a message's row. The chat only redraws messages
 * whose content changed, so the first appends an invisible character and the second,
 * dispatched shortly after, restores the content. Discord ignores updates to empty content,
 * so messages without text keep the character (the row renderer hides it).
 */
function redrawEvents(message: any) {
    const base = { id: message.id, channel_id: message.channel_id, ...(isDeleted(message.id) ? localMedia(logged.get(message.id)) : {}) };
    const content: string = message.content ?? "";
    const change = { type: "MESSAGE_UPDATE", message: { ...base, content: content + ZWSP }, [OWN_EVENT]: true };
    const restore = content ? { type: "MESSAGE_UPDATE", message: { ...base, content }, [OWN_EVENT]: true } : null;
    return [change, restore] as const;
}

const RESTORE_DELAY_MS = 250;

/** Redraws a logged message's chat row, e.g. after its decoration changed. */
export function refresh(id: string, channelId = logged.get(id)?.channel_id) {
    const current = channelId && MessageStore.getMessage(channelId, id);
    if (!current) return;
    const [change, restore] = redrawEvents(current);
    FluxDispatcher.dispatch(change);
    if (restore) setTimeout(() => FluxDispatcher.dispatch(restore), RESTORE_DELAY_MS);
    notify(id);
}

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
    // Replaces the delete: the message stays in the store, and its row is redrawn as deleted.
    const [change, restore] = redrawEvents(message);
    if (restore) setTimeout(() => FluxDispatcher.dispatch(restore), RESTORE_DELAY_MS);
    return change;
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
    const stored = logged.get(id);
    if (stored) db.removeImages(stored);
    logged.delete(id);
    edits.delete(id);
    deletedByChannel.get(channelId)?.delete(id);
    db.db.batch([["DELETE FROM edits WHERE message_id = ?", [id]], ["DELETE FROM messages WHERE id = ?", [id]]]).catch(() => { });
    if (wasDeleted && removeFromChat) FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id, channelId, [OWN_EVENT]: true });
    else refresh(id, channelId);
    notify(id);
}

function handleUpdate(event: any) {
    const next = event.message;
    if (!next?.id || typeof next.content !== "string") return;
    const channelId = next.channel_id ?? event.channelId;
    const previous = MessageStore.getMessage(channelId, next.id);
    // Embed unfurls arrive as updates without a content change.
    if (!previous || previous.content === next.content || shouldIgnore(previous)) return;
    // Already recorded from MESSAGE_END_EDIT; the gateway echo of your own edit comes after it.
    if (logged.get(next.id)?.content === next.content) return;

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
        attachments: toApiAttachments(stored),
        embeds: toApiEmbeds(stored),
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
function handleLoad(event: any, isLatestPage = !event.hasMoreAfter && !event.isAfter) {
    const ids = deletedByChannel.get(event.channelId);
    if (!ids?.size || !Array.isArray(event.messages) || !event.messages.length) return;

    const loaded = event.messages.map((m: any) => m.id as string).sort((a: string, b: string) => a.length - b.length || (a < b ? -1 : 1));
    const oldest = loaded[0];
    const newest = loaded[loaded.length - 1];
    const present = new Set(loaded);

    const extra = [...ids]
        .filter(id => !present.has(id))
        .filter(id => (id.length > oldest.length || (id.length === oldest.length && id >= oldest))
            && (isLatestPage || id.length < newest.length || (id.length === newest.length && id <= newest)))
        .map(id => logged.get(id))
        .filter(Boolean) as db.StoredMessage[];
    if (!extra.length) return;
    // Logged before images were saved (or the save failed): try again while the CDN may still have them.
    setTimeout(() => extra.forEach(saveImages), 0);

    // The API returns newest first.
    event.messages = [...event.messages, ...extra.map(toApiMessage)].sort((a: any, b: any) =>
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
                    setTimeout(() => loggedIds.forEach((id: string) => refresh(id, event.channelId)), 0);
                    return [{ ...event, ids: kept }];
                }
                case "MESSAGE_UPDATE":
                    if (settings.logEdits) handleUpdate(event);
                    return;
                // Your own edits reach the store through the edit request's response; the
                // MESSAGE_UPDATE that follows from the gateway no longer changes anything.
                case "MESSAGE_END_EDIT":
                    if (settings.logEdits && event.response?.ok !== false && event.response?.body?.id) {
                        handleUpdate({ message: event.response.body, channelId: event.channelId });
                    }
                    return;
                case "LOAD_MESSAGES_SUCCESS":
                    handleLoad(event);
                    return;
                // Opening a channel from the on-device cache (the latest messages).
                case "LOCAL_MESSAGES_LOADED":
                    handleLoad(event, true);
                    return;
                // Jumping to a message.
                case "LOAD_MESSAGES_AROUND_SUCCESS":
                    handleLoad(event, false);
                    return;
            }
        } catch (e) {
            logger.error(`Failed handling ${event.type}`, e);
        }
    });
}
