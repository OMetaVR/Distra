// Messages only you can see, posted by Clyde into a channel (what Vendetta calls "ephemeral").
// Plugins ask for them in several shapes: a string, an Enmity `{ embeds, components }` object,
// or an interaction response `{ type: 4, data: { content, embeds, flags: 64 } }`.

import { findByProps } from "@/metro";

export interface LocalMessage {
    content?: string;
    embeds?: unknown[];
    components?: unknown[];
}

/** The message body inside an interaction response, or the response itself. */
export function localMessageOf(payload: unknown): LocalMessage {
    if (typeof payload === "string") return { content: payload };
    const body: any = (payload as any)?.data ?? payload ?? {};
    return { content: body.content, embeds: body.embeds, components: body.components };
}

/** Whether a command result asks to be shown only to the user (interaction response or ephemeral flag). */
export function isLocalOnly(result: any): boolean {
    if (!result || typeof result !== "object") return false;
    if (result.type === 4 && result.data) return true;
    return typeof result.flags === "number" && (result.flags & 64) !== 0;
}

export function sendLocalMessage(channelId: string, payload: unknown) {
    const { content, embeds, components } = localMessageOf(payload);
    const creator = findByProps("createBotMessage");
    const actions = findByProps("sendMessage", "receiveMessage");
    if (!creator?.createBotMessage || !actions?.receiveMessage) throw new Error("Local messages are unavailable");
    const message = creator.createBotMessage({ channelId, content: content ?? "", embeds, loggingName: "distra" });
    if (components?.length) message.components = components;
    actions.receiveMessage(channelId, message);
    return message;
}
