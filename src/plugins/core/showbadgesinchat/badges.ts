// Which badges a user has: Discord's profile badges (from their cached profile, else their public
// flags), Nitro, Global Badges (the vendored Global Badges plugin publishes what it loaded) and
// Fake Badges (self-assigned, read from the About Me of loaded profiles).

import { findByStoreNameLazy } from "@/metro";

import { type BadgeGroup, settings } from "./settings";

const UserStore = findByStoreNameLazy("UserStore");
const UserProfileStore = findByStoreNameLazy("UserProfileStore");

export interface ChatBadge {
    label: string;
    url: string;
}

const badgeIcon = (hash: string) => `https://cdn.discordapp.com/badge-icons/${hash}.png`;
const NITRO_ICON = "2ba85e8026a8614b640c2837bcdfe21b";

// [public flag bit, name, icon] (from Vencord's ShowBadgesInChat).
const FLAG_BADGES: readonly [number, string, string][] = [
    [0, "Discord Staff", "5e74e9b61934fc1f67c65515d1f7e60d"],
    [1, "Partnered Server Owner", "3f9748e53446a137a052f3454e2de41e"],
    [2, "HypeSquad Events", "bf01d1073931f921909045f3a39fd264"],
    [6, "HypeSquad Bravery", "8a88d63823d8a71cd5e390baa45efa02"],
    [7, "HypeSquad Brilliance", "011940fd013da3f7fb926e4a1cd2e618"],
    [8, "HypeSquad Balance", "3aa41de486fa12454c3761e8e223442e"],
    [3, "Discord Bug Hunter", "2717692c7dca7289b35297368a940dd0"],
    [14, "Discord Bug Hunter", "848f79194d4be5ff5f81505cbd0ce1e6"],
    [17, "Early Verified Bot Developer", "6df5892e0f35b051f8b61eace34f4967"],
    [9, "Early Supporter", "7060786766c9c840eb3019e725d2b358"],
    [18, "Moderator Programs Alumni", "fee1624003e2fee35cb398e125dc479b"],
];

const isNitroBadge = (badge: any) => badge?.id === "premium" || /^premium_tenure/.test(badge?.id ?? "");

function discordBadges(userId: string, user: any): ChatBadge[] {
    const profile = UserProfileStore.getUserProfile?.(userId);
    if (Array.isArray(profile?.badges) && profile.badges.length) {
        return profile.badges.filter((badge: any) => badge?.icon && !isNitroBadge(badge)).map((badge: any) => ({ label: badge.description ?? badge.id, url: badgeIcon(badge.icon) }));
    }
    const flags = user?.publicFlags ?? user?.public_flags ?? user?.flags ?? 0;
    return FLAG_BADGES.filter(([bit]) => flags & (1 << bit)).map(([, label, icon]) => ({ label, url: badgeIcon(icon) }));
}

function nitroBadges(userId: string, user: any): ChatBadge[] {
    const profile = UserProfileStore.getUserProfile?.(userId);
    const fromProfile = (profile?.badges ?? []).find(isNitroBadge);
    if (fromProfile?.icon) return [{ label: fromProfile.description ?? "Discord Nitro", url: badgeIcon(fromProfile.icon) }];
    const type = user?.premiumType ?? profile?.premiumType ?? 0;
    if (!type) return [];
    return [{ label: `Discord Nitro${type === 3 ? " Basic" : type === 1 ? " Classic" : ""}`, url: badgeIcon(NITRO_ICON) }];
}

function globalBadges(userId: string): ChatBadge[] {
    const list = (globalThis as any).distraGlobalBadges?.badgesFor?.(userId);
    if (!Array.isArray(list)) return [];
    return list.filter(badge => typeof badge?.badge === "string").map(badge => ({ label: badge.tooltip ?? badge.mod ?? "Badge", url: badge.badge }));
}

function fakeBadges(userId: string): ChatBadge[] {
    const list = (globalThis as any).distra?.plugins?.getInstance?.("distra:fake-badges")?.api?.badgesFor?.(userId);
    return Array.isArray(list) ? list : [];
}

const sources: Record<BadgeGroup, (userId: string, user: any) => ChatBadge[]> = {
    global: globalBadges,
    fake: fakeBadges,
    discord: discordBadges,
    nitro: nitroBadges,
};

/** The badges to show for a user, in the configured order. */
export function badgesFor(userId: string): ChatBadge[] {
    const user = UserStore.getUser?.(userId);
    const badges = settings.order.filter(group => settings.show[group]).flatMap(group => sources[group]?.(userId, user) ?? []);
    return settings.limit > 0 ? badges.slice(0, settings.limit) : badges;
}
