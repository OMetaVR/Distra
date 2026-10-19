// Download All Attachments: "Download all attachments (N)" in the long-press menu of messages with
// attachments. Images and videos go to Photos the way Discord's own Save Image / Save Video do
// (MediaManager.downloadMediaAssetWithContentType, after refreshing expired attachment links);
// other files, which Discord only opens in the browser, are saved to Distra's Downloads folder
// (Files > On My iPhone > Discord > Distra > Downloads).

import { callNative } from "@/core/bridge";
import { fileExists } from "@/core/fs";
import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { addMessageSheetRows } from "@/lib/messageSheet";
import { findByProps } from "@/metro";
import { toasts } from "@/metro/common";

import { definePlugin } from "../types";

const logger = new Logger("DownloadAttachments");

const MediaManager = () => findByProps("downloadMediaAssetWithContentType", "getSupportedImageTypes");
const MediaTypes = () => findByProps("MediaType")?.MediaType as { IMAGE: number; GIF: number; VIDEO: number } | undefined;
const AttachmentUrls = () => findByProps("maybeRefreshAttachmentUrl", "isRefreshableAttachmentUrl");
const UrlUtils = () => findByProps("toURLSafe");

export const DOWNLOADS_DIR = "Downloads";
const TOAST_KEY = "distra-download-attachments";

type Kind = "image" | "gif" | "video" | "file";

interface Attachment {
    id: string;
    filename: string;
    url: string;
    contentType?: string;
    kind: Kind;
}

const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

function photoExtensions(): Set<string> {
    const list: string[] = MediaManager()?.getConstants?.()?.supportedExtensions ?? ["jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "mov", "mp4", "qt"];
    return new Set(list.map(ext => ext.toLowerCase()));
}

/** Where an attachment goes: Photos (as an image, GIF or video) or a file. */
function kindOf(attachment: any, photos: Set<string>): Kind {
    const type = String(attachment.content_type ?? attachment.contentType ?? "").toLowerCase();
    const ext = extensionOf(attachment.filename ?? attachment.url ?? "");
    const typeExt = type.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ?? "";
    const savable = photos.has(ext) || photos.has(typeExt);
    if (!savable) return "file";
    if (type === "image/gif" || ext === "gif") return "gif";
    if (type.startsWith("video/") || ["mov", "mp4", "qt"].includes(ext)) return "video";
    if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "avif", "heic", "dng"].includes(ext)) return "image";
    return "file";
}

export function attachmentsOf(message: any): Attachment[] {
    const list = Array.isArray(message?.attachments) ? message.attachments : [];
    const photos = photoExtensions();
    return list
        .filter((attachment: any) => typeof attachment?.url === "string")
        .map((attachment: any) => ({
            id: String(attachment.id),
            filename: String(attachment.filename ?? attachment.title ?? `attachment-${attachment.id}`),
            url: attachment.url,
            contentType: attachment.content_type ?? attachment.contentType,
            kind: kindOf(attachment, photos),
        }));
}

/** The attachment's link, refreshed first if Discord's signed link may have expired (as Save Image does). */
async function freshUrl(url: string): Promise<string> {
    const utils = AttachmentUrls();
    try {
        const safe = UrlUtils()?.toURLSafe?.(url);
        if (safe && utils?.isRefreshableAttachmentUrl?.(safe)) return String(await utils.maybeRefreshAttachmentUrl(url) ?? url);
    } catch (e) {
        logger.warn("Couldn't refresh an attachment link", e);
    }
    return url;
}

const safeName = (name: string) => name.replace(/[/\\:\0]/g, "_").replace(/^\.+/, "_").slice(0, 180) || "attachment";

/** A path in the Downloads folder that doesn't exist yet. */
async function freePath(filename: string) {
    const name = safeName(filename);
    const dot = name.lastIndexOf(".");
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let n = 0; n < 50; n++) {
        const path = `${DOWNLOADS_DIR}/${n ? `${base} (${n})` : base}${ext}`;
        if (!await fileExists(path).catch(() => false)) return path;
    }
    return `${DOWNLOADS_DIR}/${base} (${Date.now()})${ext}`;
}

async function save(attachment: Attachment) {
    const url = await freshUrl(attachment.url);
    if (attachment.kind === "file") {
        await callNative("fs.download", url, await freePath(attachment.filename));
        return;
    }
    const manager = MediaManager();
    const types = MediaTypes();
    if (!manager || !types) throw new Error("Discord's media saver wasn't found");
    const type = attachment.kind === "video" ? types.VIDEO : attachment.kind === "gif" ? types.GIF : types.IMAGE;
    await manager.downloadMediaAssetWithContentType(url, type, attachment.contentType);
}

function toast(content: string, icon: string) {
    try {
        toasts.open({ key: TOAST_KEY, content, source: findAssetId(icon), icon: findAssetId(icon) });
    } catch (e) {
        logger.warn("Toast failed", e);
    }
}

let running = false;

export async function downloadAll(message: any) {
    const attachments = attachmentsOf(message);
    if (!attachments.length) return;
    if (running) return toast("Already downloading attachments", "DownloadIcon");
    running = true;
    let photos = 0;
    let files = 0;
    const failed: string[] = [];
    try {
        for (const [index, attachment] of attachments.entries()) {
            toast(attachments.length > 1 ? `Downloading ${index + 1} of ${attachments.length}…` : "Downloading…", "DownloadIcon");
            try {
                await save(attachment);
                if (attachment.kind === "file") files++;
                else photos++;
            } catch (e) {
                logger.error(`Couldn't save ${attachment.filename}`, e);
                failed.push(attachment.filename);
            }
        }
    } finally {
        running = false;
    }
    const saved = [photos && `${photos} to Photos`, files && `${files} to Files (Distra > Downloads)`].filter(Boolean).join(", ");
    if (!failed.length) toast(`Saved ${saved}`, "CheckmarkLargeIcon");
    else if (saved) toast(`Saved ${saved}; ${failed.length} failed`, "WarningIcon");
    else toast(failed.length > 1 ? `Couldn't save the ${failed.length} attachments` : "Couldn't save the attachment", "CircleXIcon");
}

let removeRows: (() => void) | undefined;

export default definePlugin({
    id: "distra:download-attachments",
    manifest: {
        name: "Download All Attachments",
        description: "Hold a message with attachments and choose Download all attachments: images and videos go to Photos, other files to the Files app.",
        authors: [{ name: "Distra" }],
        version: "1.0.0",
    },

    start() {
        removeRows = addMessageSheetRows(message => {
            const count = Array.isArray(message?.attachments) ? message.attachments.length : 0;
            if (!count) return null;
            return {
                key: "distra-download-attachments",
                label: `Download all attachments (${count})`,
                icon: "DownloadIcon",
                onPress: () => void downloadAll(message),
            };
        });
    },

    stop() {
        removeRows?.();
        removeRows = undefined;
    },

    api: { downloadAll, attachmentsOf },
});
