import { FluxDispatcher } from "@/metro/common";

import type { StoredMessage } from "./db";

/** Removes deleted messages the logger kept on screen (used when it's turned off). */
export function removeKeptMessages(messages: StoredMessage[]) {
    for (const message of messages) {
        FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id: message.id, channelId: message.channel_id, __distraLogger: true });
    }
}
