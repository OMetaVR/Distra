// Friendship Ranks: a badge on a friend's profile showing how long you've been friends (Sprout, Blooming,
// ... Besties). Port of Equicord's FriendshipRanks (GPL-3.0-or-later, by Samwich) for mobile:
//
//   - the badge joins the user's own badges where Discord builds the list (useBadges), so it renders, wraps
//     and counts towards the "+N" chip like Discord's badges (and Global Badges'), and tapping it shows a toast
//     with its label (Discord's badge tap);
//   - a badge's image comes from getProfileBadgeIconUrl, which answers with the rank's bundled icon;
//   - the friendship start date is RelationshipStore.getSince.

import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByName, findByProps, findByStoreNameLazy } from "@/metro";

import { definePlugin } from "../types";
import { daysSince, formatDuration, rankFor } from "./ranks";
import SettingsPage from "./SettingsPage";

const logger = new Logger("FriendshipRanks");
let patcher = createPatcher("FriendshipRanks");

const RelationshipStore = findByStoreNameLazy("RelationshipStore");
const PREFIX = "distra-friendship-";

/** The rank badge for a user you're friends with, as useBadges returns badges. */
function badgeFor(userId: string | undefined) {
    if (!userId || !RelationshipStore.isFriend?.(userId)) return undefined;
    const since = RelationshipStore.getSince?.(userId);
    if (!since) return undefined;
    const days = daysSince(since);
    const rank = rankFor(days);
    if (!rank) return undefined;
    return { id: `${PREFIX}${rank.id}`, description: `${rank.title} · friends for ${formatDuration(days)}`, icon: rank.icon };
}

export default definePlugin({
    id: "distra:friendship-ranks",
    manifest: {
        name: "Friendship Ranks",
        description: "Adds a badge to your friends' profiles showing how long you've been friends, from Sprout to Besties.",
        authors: [{ name: "Distra" }, { name: "Samwich (Equicord FriendshipRanks)" }],
        version: "1.0.0",
    },
    start() {
        patcher = createPatcher("FriendshipRanks");
        const useBadges = findByName("useBadges", false);
        const badgeUtils = findByProps("getProfileBadgeIconUrl");
        if (!useBadges?.default || !badgeUtils) return logger.warn("Profile badges not found; ranks won't show");

        patcher.after("default", useBadges, ([user], badges) => {
            if (!Array.isArray(badges)) return;
            const badge = badgeFor(user?.userId);
            if (!badge || badges.some(existing => existing?.id === badge.id)) return;
            // A copy: the list may be memoized by Discord.
            return [...badges, badge];
        });
        patcher.instead("getProfileBadgeIconUrl", badgeUtils, ([badge], original) =>
            typeof badge?.id === "string" && badge.id.startsWith(PREFIX) ? badge.icon : original(badge));
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
});
