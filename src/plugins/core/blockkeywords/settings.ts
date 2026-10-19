import { createFileStorage } from "@/core/storage";

export interface BlockKeywordsSettings {
    keywords: string[];
    /** Treat each keyword as a regular expression. */
    useRegex: boolean;
    caseSensitive: boolean;
    /** Plain keywords only match whole words. */
    wholeWords: boolean;
    /** Also check embed titles and descriptions (link previews, bot embeds). */
    checkEmbeds: boolean;
    ignoreOwnMessages: boolean;
    /** New matching messages are dropped as they arrive: no unread badge, no "new messages" bar. */
    ignoreNewMessages: boolean;
}

export const defaults: BlockKeywordsSettings = {
    keywords: [],
    useRegex: false,
    caseSensitive: false,
    wholeWords: true,
    checkEmbeds: true,
    ignoreOwnMessages: true,
    ignoreNewMessages: true,
};

export let settings: BlockKeywordsSettings = { ...defaults, keywords: [] };

export async function loadSettings() {
    settings = await createFileStorage<BlockKeywordsSettings>("plugins/data/core-blockkeywords.json", defaults);
    if (!Array.isArray(settings.keywords)) settings.keywords = [];
}
