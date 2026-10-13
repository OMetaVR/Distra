// The hot set: logged messages within retention, kept in memory so the synchronous
// dispatcher and row renderer never wait on the database.

import type { StoredEdit, StoredMessage } from "./db";

export const logged = new Map<string, StoredMessage>();
export const edits = new Map<string, StoredEdit[]>();
/** Deleted message ids per channel, for re-inserting them when a channel loads. */
export const deletedByChannel = new Map<string, Set<string>>();

export function remember(message: StoredMessage) {
    logged.set(message.id, message);
    if (message.deleted_at != null) {
        let set = deletedByChannel.get(message.channel_id);
        if (!set) deletedByChannel.set(message.channel_id, set = new Set());
        set.add(message.id);
    }
}

export function rememberEdit(edit: StoredEdit) {
    const list = edits.get(edit.message_id) ?? [];
    if (!list.some(e => e.edited_at === edit.edited_at)) list.push(edit);
    edits.set(edit.message_id, list);
}

export const isDeleted = (id: string) => logged.get(id)?.deleted_at != null;

export function forget(id: string) {
    const message = logged.get(id);
    if (message) deletedByChannel.get(message.channel_id)?.delete(id);
    logged.delete(id);
    edits.delete(id);
}

export function reset() {
    logged.clear();
    edits.clear();
    deletedByChannel.clear();
}

/** Snowflake ids compare numerically; they're too large for Number. */
export const compareIds = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/** Snowflake creation time in ms (float precision is plenty after dropping the low 22 bits). */
export const snowflakeTime = (id: string) => Math.floor(Number(id) / 4194304) + 1420070400000;
