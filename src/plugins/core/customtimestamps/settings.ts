import { createFileStorage } from "@/core/storage";

export type FormatKey = "header" | "tooltip" | "accessibility" | "sameDay" | "lastDay" | "lastWeek" | "sameElse";

export interface FormatInfo {
    name: string;
    description: string;
    default: string;
    presets: string[];
    /** How far back the preview date for this format is (calendar formats). */
    offset?: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Equicord's formats, minus compact mode (Discord mobile has no compact message layout). */
export const FORMATS: Record<FormatKey, FormatInfo> = {
    header: {
        name: "Message header",
        description: "Next to the author's name",
        default: "[calendar]",
        presets: ["[calendar]", "LT", "HH:mm", "HH:mm:ss", "h:mm:ss A", "L LT", "[relative]"],
    },
    tooltip: {
        name: "Full date",
        description: "Shown when you tap a timestamp or the edited label, and on <t:…> timestamps in messages",
        default: "LLLL • [relative]",
        presets: ["LLLL • [relative]", "LLLL", "dddd, D MMMM YYYY HH:mm:ss", "YYYY-MM-DD HH:mm:ss", "[calendar] • [relative]"],
    },
    accessibility: {
        name: "Screen reader",
        description: "What VoiceOver reads for the timestamp",
        default: "[calendar]",
        presets: ["[calendar]", "LLLL", "LLL"],
    },
    sameDay: {
        name: "Today",
        description: "[calendar] for messages from today",
        default: "[Today at] HH:mm:ss",
        presets: ["[Today at] HH:mm:ss", "[Today at] LT", "LT", "HH:mm", "[relative]"],
        offset: 0,
    },
    lastDay: {
        name: "Yesterday",
        description: "[calendar] for messages from yesterday",
        default: "[Yesterday at] HH:mm:ss",
        presets: ["[Yesterday at] HH:mm:ss", "[Yesterday at] LT", "[Yesterday] HH:mm"],
        offset: -DAY,
    },
    lastWeek: {
        name: "Last week",
        description: "[calendar] for messages from the last 6 days",
        default: "ddd DD.MM.YYYY HH:mm:ss",
        presets: ["ddd DD.MM.YYYY HH:mm:ss", "dddd [at] LT", "ddd HH:mm", "L LT"],
        // A full week back would already be an "older" date a second later.
        offset: -6 * DAY,
    },
    sameElse: {
        name: "Older",
        description: "[calendar] for anything older",
        default: "ddd DD.MM.YYYY HH:mm:ss",
        presets: ["ddd DD.MM.YYYY HH:mm:ss", "L LT", "YYYY-MM-DD HH:mm", "D MMM YYYY", "[relative]"],
        offset: -31 * DAY,
    },
};

export const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];
export const CALENDAR_KEYS: FormatKey[] = ["sameDay", "lastDay", "lastWeek", "sameElse"];

export interface TimestampSettings {
    formats: Partial<Record<FormatKey, string>>;
    /** Also rewrite <t:…> timestamps' tap text in message content. */
    markdownTimestamps: boolean;
}

export const defaults: TimestampSettings = { formats: {}, markdownTimestamps: true };

export let settings: TimestampSettings = { ...defaults, formats: {} };

export async function loadSettings() {
    settings = await createFileStorage<TimestampSettings>("plugins/data/core-customtimestamps.json", defaults);
    settings.formats ??= {};
}

export const formatOf = (key: FormatKey) => settings.formats?.[key] || FORMATS[key].default;
