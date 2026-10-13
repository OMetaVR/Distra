import { createFileStorage } from "@/core/storage";

export interface LoggerSettings {
    logDeletes: boolean;
    logEdits: boolean;
    ignoreBots: boolean;
    ignoreSelf: boolean;
    /** Ignore deletes caused by PluralKit replacing a message with its proxy. */
    ignorePluralKit: boolean;
    ignoredUsers: string[];
    ignoredChannels: string[];
    ignoredGuilds: string[];
    /** Show the time of deletion in the "deleted" label. */
    showDeleteTime: boolean;
    deletedTextColor: string;
    /** Red background and gutter on deleted messages. */
    highlightDeleted: boolean;
    highlightColor: string;
    editedTextColor: string;
    /** Keep a greyed-out copy of images in deleted messages. */
    saveImages: boolean;
    retentionDays: number;
    maxMessages: number;
}

export const defaults: LoggerSettings = {
    logDeletes: true,
    logEdits: true,
    ignoreBots: false,
    ignoreSelf: false,
    ignorePluralKit: true,
    ignoredUsers: [],
    ignoredChannels: [],
    ignoredGuilds: [],
    showDeleteTime: true,
    deletedTextColor: "#F23F43",
    highlightDeleted: true,
    highlightColor: "#F23F43",
    editedTextColor: "#8E9297",
    saveImages: true,
    retentionDays: 14,
    maxMessages: 5000,
};

export let settings: LoggerSettings = { ...defaults };

export async function loadSettings() {
    settings = await createFileStorage<LoggerSettings>("plugins/data/core-messagelogger.json", defaults);
}
