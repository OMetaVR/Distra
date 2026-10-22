// Fake Badges: give yourself any Discord badge. The picks are stored invisibly at the end of your About Me
// (see badges.ts), so anyone using Distra (iOS or desktop) with this plugin sees them on your profile,
// always labelled as fake. Port of Distra Desktop's FakeBadges:
//
//   - the badges join the user's own badges where Discord builds the list (useBadges), like Friendship
//     Ranks, using Discord's own badge images, so they render, wrap and count towards the "+N" chip;
//   - Show Badges In Chat reads them through `api.badgesFor`;
//   - the settings page edits and saves your own (a PATCH of your profile's bio, like the desktop editor).

import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByName, findByStoreNameLazy } from "@/metro";

import { definePlugin } from "../types";
import { badgeIconUrl, decodeBadges, fakeName } from "./badges";
import SettingsPage from "./SettingsPage";

const logger = new Logger("FakeBadges");
let patcher = createPatcher("FakeBadges");

const UserProfileStore = findByStoreNameLazy("UserProfileStore");
const PREFIX = "distra-fake-badge-";

/** A user's fake badges, from the bio of their loaded profile. */
const fakeBadgesOf = (userId: string | undefined) => (userId ? decodeBadges(UserProfileStore.getUserProfile?.(userId)?.bio) : []);

export default definePlugin({
    id: "distra:fake-badges",
    manifest: {
        name: "Fake Badges",
        description: "Give yourself any Discord badge. Other Distra users see them on your profile, clearly labelled as fake.",
        authors: [{ name: "Distra" }, { name: "mmeta (Distra Desktop FakeBadges)" }],
        version: "1.0.0",
    },
    start() {
        patcher = createPatcher("FakeBadges");
        const useBadges = findByName("useBadges", false);
        if (!useBadges?.default) return logger.warn("Profile badges not found; fake badges won't show on profiles");

        patcher.after("default", useBadges, ([user], badges) => {
            if (!Array.isArray(badges)) return;
            const fakes = fakeBadgesOf(user?.userId)
                .map(badge => ({ id: `${PREFIX}${badge.code}`, description: fakeName(badge), icon: badge.icon }))
                .filter(badge => !badges.some(existing => existing?.id === badge.id));
            // A copy: the list may be memoized by Discord.
            return fakes.length ? [...badges, ...fakes] : undefined;
        });
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
    api: {
        /** For Show Badges In Chat: `{ label, url }` per fake badge of a user whose profile is loaded. */
        badgesFor: (userId: string) => fakeBadgesOf(userId).map(badge => ({ label: fakeName(badge), url: badgeIconUrl(badge) })),
    },
});
