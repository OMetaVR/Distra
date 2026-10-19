import { createFileStorage } from "@/core/storage";

export interface TimezoneSettings {
    /** Time zones you set, by user id. */
    zones: Record<string, string>;
    showInProfile: boolean;
    showInMessages: boolean;
    showOwn: boolean;
    /** Show "EDT" / "GMT+1" after the time. */
    showZoneName: boolean;
    hourCycle: "auto" | "12" | "24";
    /** Fetch the time zones people saved in Equicord's public timezone database. */
    useDatabase: boolean;
    /** Use the database's zone even when you set one yourself. */
    preferDatabase: boolean;
    databaseUrl: string;
}

export const DEFAULT_DATABASE = "https://timezone.creations.works";

export const defaults: TimezoneSettings = {
    zones: {},
    showInProfile: true,
    showInMessages: true,
    showOwn: true,
    showZoneName: true,
    hourCycle: "auto",
    useDatabase: true,
    preferDatabase: false,
    databaseUrl: DEFAULT_DATABASE,
};

export let settings: TimezoneSettings = { ...defaults, zones: {} };

export async function loadSettings() {
    settings = await createFileStorage<TimezoneSettings>("plugins/data/core-timezones.json", defaults);
    settings.zones ??= {};
}
