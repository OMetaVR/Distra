import { createFileStorage } from "@/core/storage";

export interface ExpandableBadgesSettings {
    /** Always show every badge, without the expand button. */
    alwaysExpand: boolean;
    /** How many badges show while collapsed (Discord shows 6). */
    collapsedCount: number;
    /** Keep badges expanded on every profile once expanded, until collapsed again. */
    rememberExpanded: boolean;
    /** The remembered state. */
    expanded: boolean;
}

export const COLLAPSED_COUNTS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const defaults: ExpandableBadgesSettings = { alwaysExpand: false, collapsedCount: 6, rememberExpanded: true, expanded: false };

export let settings: ExpandableBadgesSettings = { ...defaults };

export async function loadSettings() {
    settings = await createFileStorage<ExpandableBadgesSettings>("plugins/data/core-expandablebadges.json", defaults);
}
