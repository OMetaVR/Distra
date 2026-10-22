import { createFileStorage } from "@/core/storage";

export type BadgeGroup = "global" | "fake" | "discord" | "nitro";
export type Placement = "header" | "text" | "name";

export interface BadgeSettings {
    show: Record<BadgeGroup, boolean>;
    order: BadgeGroup[];
    /**
     * "header": after the name and timestamp, wrapping onto a second header line (needs the
     * tweak's header hook; without it they get their own line above the message text).
     * "text": their own line above the message text.
     * "name": the first one in the role icon spot next to the name (when free), the rest as "header".
     */
    placement: Placement;
    /** Most badges shown per message (0: all). */
    limit: number;
    /** Bumped when a default changes so saved settings pick it up once. */
    layoutVersion?: number;
}

export const GROUPS: BadgeGroup[] = ["global", "fake", "discord", "nitro"];
const PLACEMENTS: Placement[] = ["header", "text", "name"];
const LAYOUT_VERSION = 2;

export const defaults: BadgeSettings = {
    show: { global: true, fake: true, discord: true, nitro: true },
    order: [...GROUPS],
    placement: "header",
    limit: 5,
    layoutVersion: LAYOUT_VERSION,
};

/** Runtime state shared with the settings page. */
export const state = {
    /** Whether the tweak draws badges in message headers (tweak/Sources/DSTHeaderBadges.m). */
    nativeHeader: false,
};

export let settings: BadgeSettings = { ...defaults, show: { ...defaults.show }, order: [...defaults.order] };

export async function loadSettings() {
    settings = await createFileStorage<BadgeSettings>("plugins/data/core-showbadgesinchat.json", defaults);
    settings.show = { ...defaults.show, ...settings.show };
    const order = Array.isArray(settings.order) ? settings.order.filter(group => GROUPS.includes(group)) : [];
    settings.order = [...order, ...GROUPS.filter(group => !order.includes(group))];
    // Version 1 put badges in front of the message text by default; the header is the new default.
    if ((settings.layoutVersion ?? 1) < LAYOUT_VERSION) {
        if (settings.placement !== "name") settings.placement = "header";
        settings.layoutVersion = LAYOUT_VERSION;
    }
    if (!PLACEMENTS.includes(settings.placement)) settings.placement = defaults.placement;
}
