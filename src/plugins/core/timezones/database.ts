// Equicord's public timezone database (timezone.creations.works, by creations): people save their
// own time zone there from Equicord/Vencord's Timezones plugin. Read-only here: the whole list is
// fetched (GET /list, about 10k users) and kept on the device for a day. Saving your own zone needs
// the site's Discord sign-in, so the settings page links to the site instead.

import { readJSON, writeJSON } from "@/core/fs";
import { Logger } from "@/lib/logger";

import { DEFAULT_DATABASE, settings } from "./settings";

const logger = new Logger("Timezones");
const CACHE = "plugins/data/core-timezones-db.json";
const MAX_AGE = 24 * 60 * 60 * 1000;
const TIMEOUT = 20000;

interface Cache {
    fetchedAt: number;
    url: string;
    zones: Record<string, string>;
}

let cache: Cache | null = null;
let loading: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export const onDatabaseChanged = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));
const changed = () => listeners.forEach(listener => listener());

const baseUrl = () => (settings.databaseUrl || DEFAULT_DATABASE).replace(/\/+$/, "");

export const databaseZone = (userId: string): string | undefined => settings.useDatabase ? cache?.zones[userId] : undefined;
export const databaseInfo = () => ({ count: cache ? Object.keys(cache.zones).length : 0, fetchedAt: cache?.fetchedAt, loading: loading != null });

async function fetchList(): Promise<boolean> {
    const url = baseUrl();
    const request = fetch(`${url}/list`, { headers: { Accept: "application/json" } }).then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT));
    try {
        const json: Record<string, { timezone?: string | null }> = await Promise.race([request, timeout]);
        const zones: Record<string, string> = {};
        for (const id in json) {
            const zone = json[id]?.timezone;
            if (typeof zone === "string" && zone) zones[id] = zone;
        }
        cache = { fetchedAt: Date.now(), url, zones };
        writeJSON(CACHE, cache).catch(e => logger.warn("Couldn't save the timezone database", e));
        logger.info(`Timezone database: ${Object.keys(zones).length} users`);
        return true;
    } catch (e) {
        logger.warn("Couldn't fetch the timezone database", e);
        return false;
    }
}

/** Fetches the list now (or joins a fetch in progress). */
export function refreshDatabase(): Promise<boolean> {
    loading ??= fetchList().finally(() => {
        loading = null;
        changed();
    });
    changed();
    return loading;
}

/** Loads the saved copy, then refreshes it when it's old or from another server. */
export async function loadDatabase() {
    if (!settings.useDatabase) return;
    if (!cache) {
        try {
            const saved = await readJSON<Cache>(CACHE);
            if (saved?.zones) cache = saved;
        } catch { }
        changed();
    }
    if (!cache || cache.url !== baseUrl() || Date.now() - cache.fetchedAt > MAX_AGE) void refreshDatabase();
}

export const databaseSite = () => baseUrl();
