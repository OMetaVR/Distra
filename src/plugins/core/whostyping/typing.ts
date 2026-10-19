// Who's Typing: shared helpers. Which users count as "typing" in a channel (settings applied),
// display names, role colours, and opening a profile.

import { useMemo } from "react";

import { findByFilePath, findByProps, findByStoreNameLazy } from "@/metro";
import { useStateFromStores } from "@/metro/common";

import { settings } from "./settings";

const TypingStore = findByStoreNameLazy("TypingStore");
const UserStore = findByStoreNameLazy("UserStore");
const RelationshipStore = findByStoreNameLazy("RelationshipStore");
const GuildMemberStore = findByStoreNameLazy("GuildMemberStore");
const SelectedChannelStore = findByStoreNameLazy("SelectedChannelStore");
const UserGuildSettingsStore = findByStoreNameLazy("UserGuildSettingsStore");

const EMPTY: string[] = [];

function isMuted(channelId: string, guildId?: string | null) {
    try {
        return !!UserGuildSettingsStore.isChannelMuted?.(guildId ?? null, channelId);
    } catch {
        return false;
    }
}

/** Users typing in a channel who pass the settings, as a comma-joined key (cheap to compare). */
function typersKey(channelId: string, guildId: string | null | undefined, muted: boolean | undefined): string {
    const typing = TypingStore.getTypingUsers?.(channelId);
    if (!typing) return "";
    if (!settings.includeCurrentChannel && SelectedChannelStore.getChannelId?.() === channelId) return "";
    if (!settings.includeMutedChannels && (muted ?? isMuted(channelId, guildId))) return "";

    const me = UserStore.getCurrentUser?.()?.id;
    return Object.keys(typing).filter(id =>
        id !== me
        && (settings.includeBlockedUsers || !RelationshipStore.isBlocked?.(id))
        && (settings.includeIgnoredUsers || !RelationshipStore.isIgnored?.(id)),
    ).join(",");
}

/** Ids of the users typing in `channelId`. Re-renders only when that list changes. */
export function useTypers(channelId: string, guildId?: string | null, muted?: boolean): string[] {
    const key: string = useStateFromStores(
        [TypingStore, RelationshipStore, SelectedChannelStore],
        () => typersKey(channelId, guildId, muted),
        [channelId, guildId, muted],
    );
    return useMemo(() => key ? key.split(",") : EMPTY, [key]);
}

/** The name Discord shows for a user in this place: server nickname, friend nickname, display name, username. */
export function displayName(userId: string, guildId?: string | null): string {
    const user = UserStore.getUser?.(userId);
    return (guildId && GuildMemberStore.getNick?.(guildId, userId))
        || RelationshipStore.getNickname?.(userId)
        || user?.globalName
        || user?.global_name
        || user?.username
        || "Someone";
}

const toColor = (value: unknown): string | undefined => {
    if (typeof value === "number") return value ? `#${value.toString(16).padStart(6, "0")}` : undefined;
    return typeof value === "string" && /^(#|rgb|hsl)/i.test(value) ? value : undefined;
};

/**
 * A user's role colour in a server. Uses the Role Color Everywhere plugin when it's running
 * (so custom colours and its rules apply), else the colour Discord's member record carries.
 */
export function roleColorOf(userId: string, guildId?: string | null): string | undefined {
    if (!guildId) return undefined;
    try {
        const roleColor = (globalThis as any).distra?.plugins?.getInstance?.("distra:role-color-everywhere")?.api?.roleColor;
        if (typeof roleColor === "function") {
            const color = toColor(roleColor(userId, guildId));
            if (color) return color;
        }
    } catch { }
    return toColor(GuildMemberStore.getMember?.(guildId, userId)?.colorString);
}

/** Opens the profile sheet for a user. */
export function openProfile(userId: string, guildId?: string | null, channelId?: string) {
    const sheet = findByFilePath("modules/user_profile/native/showUserProfileActionSheet.tsx")?.default
        ?? findByProps("showUserProfileActionSheet")?.showUserProfileActionSheet;
    if (typeof sheet === "function") return void sheet({ userId, guildId: guildId ?? undefined, channelId });
    findByProps("showUserProfile")?.showUserProfile?.({ userId, guildId: guildId ?? undefined, channelId });
}
