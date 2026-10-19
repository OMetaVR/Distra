// Which messages are hidden, per Discord account. With "Remember hidden messages" on they live in
// the plugin's JSON file and survive restarts; with it off they only last until the app restarts.

import { createFileStorage } from "@/core/storage";
import { findByStoreName } from "@/metro";

/** Hidden message id -> its channel id, per account (user id). */
type Hidden = Record<string, Record<string, string>>;

export interface HideMessagesSettings {
    remember: boolean;
    hidden: Hidden;
}

const defaults: HideMessagesSettings = { remember: true, hidden: {} };

export let settings: HideMessagesSettings = { ...defaults, hidden: {} };
let session: Hidden = {};

const listeners = new Set<() => void>();
export const onHiddenChanged = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));
const changed = () => listeners.forEach(listener => listener());

export async function loadSettings() {
    settings = await createFileStorage<HideMessagesSettings>("plugins/data/core-hidemessages.json", defaults);
    settings.hidden ??= {};
}

const UserStore = findByStoreName("UserStore");
const currentUserId = (): string | undefined => UserStore?.getCurrentUser?.()?.id;

/** The current account's hidden messages, from the persisted or the session list. */
function bucket(create = false): Record<string, string> | undefined {
    const userId = currentUserId();
    if (!userId) return undefined;
    const lists = settings.remember ? settings.hidden : session;
    if (!lists[userId] && create) lists[userId] = {};
    return lists[userId];
}

export const isHidden = (id: string) => !!id && bucket()?.[id] != null;

export function hide(id: string, channelId: string) {
    const list = bucket(true);
    if (!list || list[id]) return;
    list[id] = channelId;
    changed();
}

export function unhide(id: string) {
    const list = bucket();
    if (!list?.[id]) return;
    delete list[id];
    changed();
}

/** The current account's hidden messages. */
export const hiddenMessages = () => Object.entries(bucket() ?? {}).map(([id, channelId]) => ({ id, channelId }));

/** Clears the current account's hidden messages; returns what was hidden. */
export function clearHidden() {
    const list = hiddenMessages();
    const userId = currentUserId();
    if (userId) {
        delete settings.hidden[userId];
        delete session[userId];
    }
    changed();
    return list;
}

/** Switches persistence, moving the hidden messages between the file and the session. */
export function setRemember(remember: boolean) {
    if (settings.remember === remember) return;
    if (remember) {
        for (const [userId, list] of Object.entries(session)) settings.hidden[userId] = { ...settings.hidden[userId], ...list };
        session = {};
    } else {
        session = JSON.parse(JSON.stringify(settings.hidden));
        settings.hidden = {};
    }
    settings.remember = remember;
    changed();
}

export const resetSession = () => void (session = {});
