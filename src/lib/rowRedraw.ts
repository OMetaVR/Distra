// Redraws chat rows whose look a plugin changed (hidden, decorated, ...) without changing the message.
// The chat rebuilds its rows when the channel's messages change, and only regenerates rows whose
// message differs from the one it drew (ChatManager#determineChangeType). This marks the ids as
// changed and touches the messages with an identical local MESSAGE_UPDATE, so the rows go through
// RowManager#generate (and every plugin's patch on it) again.

import { Logger } from "@/lib/logger";
import { createPatcher, type Patcher } from "@/lib/patcher";
import { findByFilePath, findByProps, findByStoreName } from "@/metro";
import { FluxDispatcher } from "@/metro/common";

const logger = new Logger("RowRedraw");

/** Marks events Message Logger should pass through untouched (its OWN_EVENT). */
const LOGGER_OWN_EVENT = "__distraLogger";

const pending = new Map<string, number>();
let patcher: Patcher | undefined;
let installed = false;

function install() {
    installed = true;
    const ChatManager = findByFilePath("modules/messages/native/renderer/ChatManager.tsx")?.default;
    const UPDATE = findByProps("Changeset")?.Changeset?.UPDATE;
    if (typeof ChatManager?.prototype?.determineChangeType !== "function" || UPDATE == null) {
        return logger.warn("ChatManager not found; rows only redraw when their message changes");
    }
    patcher = createPatcher("RowRedraw");
    patcher.after("determineChangeType", ChatManager.prototype, ([data]: any[], type: any) => {
        const id = data?.message?.id;
        return id && pending.has(id) ? UPDATE : type;
    });
}

/** Redraws the rows of these messages (ids in `channelId`) if the chat shows them. */
export function redrawMessages(channelId: string, ids: Iterable<string>) {
    if (!installed) install();
    const MessageStore = findByStoreName("MessageStore");
    const now = Date.now();
    for (const id of ids) {
        const message = MessageStore?.getMessage?.(channelId, id) ?? MessageStore?.getMessages?.(channelId)?.get?.(id);
        if (!message) continue;
        pending.set(id, now);
        try {
            FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message: { id, channel_id: channelId, content: message.content ?? "" }, [LOGGER_OWN_EVENT]: true });
        } catch (e) {
            logger.error("Couldn't redraw a message", e);
        }
    }
    // The chat regenerates rows asynchronously; keep the marks for a moment.
    setTimeout(() => {
        for (const [id, at] of pending) if (at <= now) pending.delete(id);
    }, 1500);
}

/** Redraws messages given as `{ id, channel_id }` pairs (grouped by channel). */
export function redrawMessageList(messages: Array<{ id: string; channelId: string }>) {
    const byChannel = new Map<string, string[]>();
    for (const { id, channelId } of messages) {
        const list = byChannel.get(channelId) ?? [];
        list.push(id);
        byChannel.set(channelId, list);
    }
    for (const [channelId, ids] of byChannel) redrawMessages(channelId, ids);
}
