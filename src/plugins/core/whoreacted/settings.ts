import { createFileStorage } from "@/core/storage";

export interface WhoReactedSettings {
    /** Avatars drawn inside each reaction pill. */
    maxAvatars: number;
    /** Ask Discord for reactors it hasn't loaded yet (queued, once per reaction). */
    fetchReactors: boolean;
    /** Skip messages with more distinct reactions than this (Discord allows 20 per message). */
    maxReactions: number;
    /** Also list names in a line under the message ("🗿 Alice, Bob +3"); for tweaks without avatar support. */
    namesLine: boolean;
    /** Names per reaction in that line before "+N". */
    maxNames: number;
    /** Settings version, for one-time migrations. */
    version?: number;
}

export const defaults: WhoReactedSettings = { maxAvatars: 3, fetchReactors: true, maxReactions: 20, namesLine: false, maxNames: 3 };

export let settings: WhoReactedSettings = { ...defaults };

export async function loadSettings() {
    settings = await createFileStorage<WhoReactedSettings>("plugins/data/core-whoreacted.json", defaults);
    // v2: the old default skipped messages with more than 10 different reactions.
    if ((settings.version ?? 1) < 2) {
        if (settings.maxReactions === 10) settings.maxReactions = 20;
        settings.version = 2;
    }
}

/** What the tweak's `reactions.enable` reported; avatars only go in rows when it has the hook. */
export const nativeStatus: { checked: boolean; installed: boolean; info?: any; error?: string } = { checked: false, installed: false };
