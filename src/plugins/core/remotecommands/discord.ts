// What Remote Commands actions do in Discord (348, iOS). Each mirrors how Discord itself does it:
// sending files follows the voice message path (a CloudUpload passed to sendMessage as
// attachmentsToUpload), replies use Discord's own reply options, statuses go through
// setCustomStatus.

import { callNative } from "@/core/bridge";
import { findByFilePath, findByStoreName } from "@/metro";
import { clipboard, messageUtil, url as urlUtil } from "@/metro/common";

import type { ReplyContext } from "./protocol";

const module = (path: string) => findByFilePath(path);

export const pendingReply = (channelId: string) => findByStoreName("PendingReplyStore")?.getPendingReply?.(channelId);

export function clearPendingReply(channelId: string) {
    const actions = module("modules/replies/PendingReplyActionCreators.tsx");
    (actions?.deletePendingReply ?? actions?.default?.deletePendingReply)?.(channelId);
}

/** What the backend is told about the message being replied to. */
export function replyContextOf(reply: any): ReplyContext | null {
    const message = reply?.message;
    if (!message?.id) return null;
    return {
        messageId: message.id,
        channelId: message.channel_id,
        content: message.content ?? "",
        author: message.author ? { id: message.author.id, username: message.author.username, globalName: message.author.globalName ?? message.author.global_name ?? null } : null,
        attachments: (message.attachments ?? []).map((attachment: any) => ({
            url: attachment.url,
            filename: attachment.filename,
            contentType: attachment.content_type ?? attachment.contentType,
            size: attachment.size,
        })),
    };
}

const draft = (content: string) => ({ content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] });
const replyOptions = (reply: any) => (reply ? messageUtil.getSendMessageOptionsForReply(reply) : {}) ?? {};

export function sendText(channelId: string, content: string, reply?: any) {
    return messageUtil.sendMessage(channelId, draft(content), undefined, replyOptions(reply));
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", txt: "text/plain", json: "application/json" };

function documentsPath(): string {
    const files = (globalThis as any).nativeModuleProxy?.NativeFileModule ?? (globalThis as any).__turboModuleProxy?.("NativeFileModule");
    const path = files?.getConstants?.().DocumentsDirPath;
    if (!path) throw new Error("Can't find the app's documents folder");
    return path;
}

/** Downloads `remoteUrl` into Distra's folder, then sends it as an attachment. */
export async function sendFile(channelId: string, remoteUrl: string, filename: string, content = "", reply?: any) {
    const safeName = filename.replace(/[^\w.-]+/g, "_") || "file";
    const relative = `remote-commands/uploads/${Date.now()}-${safeName}`;
    await callNative("fs.download", remoteUrl, relative);
    const path = `${documentsPath()}/Distra/${relative}`;

    const { CloudUpload } = module("lib/uploader/CloudUpload.tsx") ?? {};
    const UploadPlatform = module("lib/uploader/Upload.tsx")?.UploadPlatform;
    if (!CloudUpload || !UploadPlatform) throw new Error("Discord's uploader wasn't found");
    const extension = safeName.split(".").pop()?.toLowerCase() ?? "";
    const upload = new CloudUpload(
        { uri: path, originalUri: path, mimeType: MIME[extension] ?? "application/octet-stream", filename: safeName, platform: UploadPlatform.REACT_NATIVE },
        channelId,
    );
    return messageUtil.sendMessage(channelId, draft(content), undefined, { ...replyOptions(reply), attachmentsToUpload: [upload] });
}

/** "👍", "name:123", "<:name:123>" or "<a:name:123>". */
function parseEmoji(emoji: string) {
    const custom = emoji.match(/^<?(a)?:?([\w~]+):(\d+)>?$/);
    return custom ? { id: custom[3], name: custom[2], animated: !!custom[1] } : { id: null, name: emoji, animated: false };
}

export function react(channelId: string, messageId: string, emoji: string) {
    const reactions = module("modules/reactions/ReactionActionCreators.tsx");
    if (!reactions?.addReaction) throw new Error("Discord's reactions weren't found");
    return reactions.addReaction(channelId, messageId, parseEmoji(emoji));
}

export function setStatus(text: string, emoji?: string | null, clearAfterMs?: number | null) {
    if (!text) return module("modules/custom_status/utils/removeCustomStatus.tsx")?.default?.();
    const set = module("modules/custom_status/setCustomStatus.tsx")?.default;
    const { ClearAfterValues } = module("modules/custom_status/Constants.tsx") ?? {};
    if (!set) throw new Error("Discord's custom status wasn't found");
    return set({
        text,
        emojiInfo: emoji ? parseEmoji(emoji) : null,
        clearAfter: clearAfterMs ?? ClearAfterValues?.DONT_CLEAR ?? null,
    });
}

export const copyText = (text: string) => clipboard.setString(text);
export const openUrl = (link: string) => urlUtil.openURL(link);
