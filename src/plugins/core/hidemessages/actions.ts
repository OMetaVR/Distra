import { redrawMessages } from "@/lib/rowRedraw";
import { findByStoreName } from "@/metro";

import * as store from "./store";

/** The message and loaded replies to it (they quote it), for redrawing. */
function withReplies(id: string, channelId: string) {
    const ids = [id];
    findByStoreName("MessageStore")?.getMessages?.(channelId)?.forEach?.((message: any) => {
        if (message?.messageReference?.message_id === id) ids.push(message.id);
    });
    return ids;
}

export function hideMessage(id: string, channelId: string) {
    store.hide(id, channelId);
    redrawMessages(channelId, withReplies(id, channelId));
}

export function showMessage(id: string, channelId: string) {
    store.unhide(id);
    if (channelId) redrawMessages(channelId, withReplies(id, channelId));
}
