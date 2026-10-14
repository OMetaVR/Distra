// Persistent log: only edited or deleted messages are stored, with snowflakes as
// 64-bit integers and compact author/attachment JSON. Edit history is its own
// table keyed by (message, time). Retention limits keep it small.
//
// Images of deleted messages are saved as files (logger/images/<key>.jpg greyed out for
// the chat, <key>.o.jpg recompressed for the full-size viewer), not in the database:
// binary files are the smallest way to keep them (base64 would add a third).

import { listDirectory, removeFile } from "@/core/fs";
import { openDatabase } from "@/lib/db";

export const db = openDatabase("messagelogger");

export interface StoredAuthor {
    /** username */ u: string;
    /** global (display) name */ g?: string | null;
    /** avatar hash */ a?: string | null;
    /** bot */ b?: boolean;
}

export interface StoredAttachment {
    id: string;
    /** filename */ f: string;
    /** url */ u: string;
    /** proxy url */ p?: string;
    w?: number;
    h?: number;
    /** size in bytes */ s?: number;
    /** content type */ t?: string;
    /** local copy (greyed out) once saved */ l?: string;
    /** local copy of the original once saved */ o?: string;
    /** the CDN no longer has it (deleted too long ago); not retried */ x?: boolean;
}

/** An image inside an embed (image or thumbnail). */
export interface StoredEmbedImage {
    /** url */ u: string;
    /** proxy url */ p?: string;
    w?: number;
    h?: number;
    /** local copy (greyed out) once saved */ l?: string;
    /** local copy of the original once saved */ o?: string;
    /** no longer downloadable; not retried */ x?: boolean;
}

/** Enough of an embed to show it again when the message is re-inserted after a relaunch. */
export interface StoredEmbed {
    /** type */ t: string;
    url?: string;
    title?: string;
    description?: string;
    color?: number;
    author?: { name: string; url?: string; icon_url?: string };
    footer?: { text: string; icon_url?: string };
    fields?: { name: string; value: string; inline?: boolean }[];
    image?: StoredEmbedImage;
    thumbnail?: StoredEmbedImage;
}

export interface StoredMessage {
    id: string;
    channel_id: string;
    guild_id: string | null;
    author_id: string;
    author: StoredAuthor;
    content: string;
    attachments: StoredAttachment[];
    embeds?: StoredEmbed[];
    deleted_at: number | null;
    updated_at: number;
}

export interface StoredEdit {
    message_id: string;
    edited_at: number;
    content: string;
}

const SCHEMA_VERSION = 2;

export async function migrate() {
    const [{ user_version: version } = { user_version: 0 }] = await db.all<{ user_version: number }>("PRAGMA user_version");
    await db.batch([
        [`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            channel_id INTEGER NOT NULL,
            guild_id INTEGER,
            author_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            attachments TEXT,
            embeds TEXT,
            deleted_at INTEGER,
            updated_at INTEGER NOT NULL
        )`],
        ["CREATE INDEX IF NOT EXISTS messages_channel ON messages (channel_id, id)"],
        ["CREATE INDEX IF NOT EXISTS messages_updated ON messages (updated_at)"],
        [`CREATE TABLE IF NOT EXISTS edits (
            message_id INTEGER NOT NULL,
            edited_at INTEGER NOT NULL,
            content TEXT NOT NULL,
            PRIMARY KEY (message_id, edited_at)
        ) WITHOUT ROWID`],
        // Version 2 added embeds; databases from version 1 have the table without it.
        ...(version === 1 ? [["ALTER TABLE messages ADD COLUMN embeds TEXT"] as [string]] : []),
        [`PRAGMA user_version = ${SCHEMA_VERSION}`],
    ]);
}

type Row = Omit<StoredMessage, "author" | "attachments" | "embeds"> & { author: string; attachments: string | null; embeds: string | null };

const parseRow = (row: Row): StoredMessage => ({
    ...row,
    id: String(row.id),
    channel_id: String(row.channel_id),
    guild_id: row.guild_id == null ? null : String(row.guild_id),
    author_id: String(row.author_id),
    author: JSON.parse(row.author),
    attachments: row.attachments ? JSON.parse(row.attachments) : [],
    embeds: row.embeds ? JSON.parse(row.embeds) : undefined,
});

const upsertSql = `INSERT INTO messages (id, channel_id, guild_id, author_id, author, content, attachments, embeds, deleted_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        content = excluded.content,
        attachments = COALESCE(excluded.attachments, messages.attachments),
        embeds = COALESCE(excluded.embeds, messages.embeds),
        deleted_at = COALESCE(excluded.deleted_at, messages.deleted_at),
        updated_at = excluded.updated_at`;

const upsertParams = (m: StoredMessage) => [
    m.id, m.channel_id, m.guild_id, m.author_id, JSON.stringify(m.author), m.content,
    m.attachments.length ? JSON.stringify(m.attachments) : null, m.embeds?.length ? JSON.stringify(m.embeds) : null, m.deleted_at, m.updated_at,
];

export const saveMessage = (message: StoredMessage) => db.run(upsertSql, upsertParams(message));

export const saveEdit = (message: StoredMessage, edit: StoredEdit) => db.batch([
    [upsertSql, upsertParams(message)],
    ["INSERT OR REPLACE INTO edits (message_id, edited_at, content) VALUES (?, ?, ?)", [edit.message_id, edit.edited_at, edit.content]],
]);

export const setMedia = (message: StoredMessage) =>
    db.run("UPDATE messages SET attachments = ?, embeds = ? WHERE id = ?", [
        message.attachments.length ? JSON.stringify(message.attachments) : null,
        message.embeds?.length ? JSON.stringify(message.embeds) : null,
        message.id,
    ]);

const IMAGE_DIR = "logger/images";

/** Path of a saved image relative to the Distra folder (`variant` "o" is the original). */
export const imagePath = (key: string, variant?: "o") => `${IMAGE_DIR}/${key}${variant ? `.${variant}` : ""}.jpg`;

/** Local image files a stored message refers to, relative to the Distra folder. */
export function imageFiles(message: Pick<StoredMessage, "attachments" | "embeds">) {
    const uris = [
        ...message.attachments.flatMap(a => [a.l, a.o]),
        ...(message.embeds ?? []).flatMap(e => [e.image?.l, e.image?.o, e.thumbnail?.l, e.thumbnail?.o]),
    ];
    return uris.flatMap(uri => {
        const index = uri?.indexOf(`${IMAGE_DIR}/`) ?? -1;
        return index === -1 ? [] : [decodeURIComponent(uri!.slice(index))];
    });
}

export const removeImages = (message: Pick<StoredMessage, "attachments" | "embeds">) =>
    Promise.allSettled(imageFiles(message).map(path => removeFile(path)));

/** Loads everything within the retention window, newest first, bounded by `limit`. */
export async function loadRecent(since: number, limit: number) {
    const messages = (await db.all<Row>(
        "SELECT * FROM messages WHERE updated_at >= ? ORDER BY id DESC LIMIT ?", [since, limit])).map(parseRow);
    const edits = (await db.all<StoredEdit>(
        `SELECT message_id, edited_at, content FROM edits WHERE message_id IN
            (SELECT id FROM messages WHERE updated_at >= ? ORDER BY id DESC LIMIT ?)
         ORDER BY edited_at`, [since, limit])).map(edit => ({ ...edit, message_id: String(edit.message_id) }));
    return { messages, edits };
}

/** Rows for the log viewer. */
export async function search({ query = "", kind = "all", limit = 200 }: { query?: string; kind?: "all" | "deleted" | "edited"; limit?: number }) {
    const where = [
        kind === "deleted" ? "deleted_at IS NOT NULL" : kind === "edited" ? "id IN (SELECT message_id FROM edits)" : "1",
        query ? "(content LIKE ? OR author LIKE ?)" : "1",
    ].join(" AND ");
    const like = `%${query.replace(/[%_]/g, "")}%`;
    return (await db.all<Row>(`SELECT * FROM messages WHERE ${where} ORDER BY updated_at DESC LIMIT ?`,
        query ? [like, like, limit] : [limit])).map(parseRow);
}

export async function editsFor(id: string) {
    return db.all<StoredEdit>("SELECT message_id, edited_at, content FROM edits WHERE message_id = ? ORDER BY edited_at", [id]);
}

/** Applies retention: drops entries older than `before` and anything beyond `maxMessages`. */
export async function prune(before: number, maxMessages: number) {
    const doomed = (await db.all<Row>(
        `SELECT * FROM messages WHERE (attachments IS NOT NULL OR embeds IS NOT NULL) AND (updated_at < ?
            OR id NOT IN (SELECT id FROM messages ORDER BY updated_at DESC LIMIT ?))`, [before, maxMessages])).map(parseRow);
    await Promise.allSettled(doomed.map(removeImages));
    await db.batch([
        ["DELETE FROM messages WHERE updated_at < ?", [before]],
        ["DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY updated_at DESC LIMIT ?)", [maxMessages]],
        ["DELETE FROM edits WHERE message_id NOT IN (SELECT id FROM messages)"],
    ]);
    await db.run("PRAGMA incremental_vacuum");
}

export async function stats() {
    const [counts] = await db.all<{ deleted: number; edited: number; total: number }>(
        `SELECT
            (SELECT COUNT(*) FROM messages WHERE deleted_at IS NOT NULL) AS deleted,
            (SELECT COUNT(DISTINCT message_id) FROM edits) AS edited,
            (SELECT COUNT(*) FROM messages) AS total`);
    return { ...counts, bytes: await db.size() };
}

export async function clearAll() {
    await db.batch([["DELETE FROM edits"], ["DELETE FROM messages"]]);
    const files = await listDirectory(IMAGE_DIR).catch(() => [] as string[]);
    await Promise.allSettled(files.map(file => removeFile(`${IMAGE_DIR}/${file}`)));
    await db.run("PRAGMA incremental_vacuum");
}
