// Which time zone a user is in: the one you set, or the one they saved in the timezone database.

import { findByStoreName } from "@/metro";

import { databaseZone } from "./database";
import { settings } from "./settings";

const UserStore = findByStoreName("UserStore");

export type ZoneSource = "local" | "database";

export function resolveZone(userId: string): { zone: string; source: ZoneSource } | undefined {
    const local = settings.zones[userId];
    const database = databaseZone(userId);
    if (database && (settings.preferDatabase || !local)) return { zone: database, source: "database" };
    if (local) return { zone: local, source: "local" };
    return undefined;
}

export function setUserZone(userId: string, zone: string | null) {
    const next = { ...settings.zones };
    if (zone) next[userId] = zone;
    else delete next[userId];
    settings.zones = next;
}

export const isSelf = (userId: string) => UserStore?.getCurrentUser?.()?.id === userId;

/** Whether to show a time for `userId` (your own only with "Show your own"). */
export const shouldShow = (userId: string) => settings.showOwn || !isSelf(userId);

export function displayName(userId: string): string {
    const user = UserStore?.getUser?.(userId);
    return user?.globalName || user?.global_name || user?.username || userId;
}
