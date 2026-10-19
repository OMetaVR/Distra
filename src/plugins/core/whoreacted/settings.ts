import { createFileStorage } from "@/core/storage";

export interface WhoReactedSettings {
    /** Avatars drawn inside each reaction pill. */
    maxAvatars: number;
    /** Ask Discord for reactors it hasn't loaded yet (queued, once per reaction). */
    fetchReactors: boolean;
    /** Skip messages with more distinct reactions than this (like the desktop plugin's 10). */
    maxReactions: number;
    /** Also list names in a line under the message ("🗿 Alice, Bob +3"); for tweaks without avatar support. */
    namesLine: boolean;
    /** Names per reaction in that line before "+N". */
    maxNames: number;
}

export const defaults: WhoReactedSettings = { maxAvatars: 3, fetchReactors: true, maxReactions: 10, namesLine: false, maxNames: 3 };

export let settings: WhoReactedSettings = { ...defaults };

export async function loadSettings() {
    settings = await createFileStorage<WhoReactedSettings>("plugins/data/core-whoreacted.json", defaults);
}

/** What the tweak's `reactions.enable` reported; avatars only go in rows when it has the hook. */
export const nativeStatus: { checked: boolean; installed: boolean; info?: any; error?: string } = { checked: false, installed: false };
