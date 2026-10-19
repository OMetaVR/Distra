import { createFileStorage } from "@/core/storage";

export interface Category {
    id: string;
    name: string;
    /** 0xRRGGBB, like Discord role colours. */
    color: number;
    channels: string[];
    collapsed?: boolean;
}

export interface PinDmsSettings {
    /** "recent": pinned DMs in each category sorted by latest message; "custom": the order you set. */
    pinOrder: "recent" | "custom";
    /** Lets the remaining (unpinned) Direct Messages section be collapsed too. */
    canCollapseDmSection: boolean;
    dmSectionCollapsed: boolean;
    /** Categories per Discord account (user id). */
    categories: Record<string, Category[]>;
}

export const defaults: PinDmsSettings = {
    pinOrder: "recent",
    canCollapseDmSection: false,
    dmSectionCollapsed: false,
    categories: {},
};

export let settings: PinDmsSettings = { ...defaults, categories: {} };

export async function loadSettings() {
    settings = await createFileStorage<PinDmsSettings>("plugins/data/core-pindms.json", defaults);
    settings.categories ??= {};
}

/** Category colours offered when creating one (Discord's role colour swatches). */
export const SWATCHES = [
    1752220, 3066993, 3447003, 10181046, 15277667, 15844367, 15105570, 15158332, 9807270, 6323595,
    1146986, 2067276, 2123412, 7419530, 11342935, 12745742, 11027200, 10038562, 9936031, 5533306,
];
export const DEFAULT_COLOR = 10070709;

export const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
