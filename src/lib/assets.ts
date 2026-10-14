// Lookup for Discord's bundled image assets by name (e.g. "WrenchIcon").

import { assetsRegistry } from "@/metro/common";
import { allModules } from "@/metro/modules";

export interface Asset {
    name: string;
    type: string;
    httpServerLocation: string;
    scales: number[];
    width?: number;
    height?: number;
    hash?: string;
}

const idsByName = new Map<string, number>();
let indexedUpTo = 0;
let fullyLoaded = false;

/** Asset ids are 1-based indices into React Native's asset registry. */
function indexRegistry() {
    for (let id = indexedUpTo + 1; ; id++) {
        const asset: Asset | undefined = assetsRegistry.getAssetByID(id);
        if (!asset) break;
        if (!idsByName.has(asset.name)) idsByName.set(asset.name, id);
        indexedUpTo = id;
    }
}

/**
 * Icons Discord renamed or removed, and the closest current icon. Plugins written for older
 * versions ask for the old names; without these they render with no icon.
 */
const RENAMED_ASSETS: Record<string, string> = {
    ic_list: "ListBulletsIcon",
    ic_dm_user: "UserIcon",
    CheckmarkIcon: "CheckmarkLargeIcon",
    CheckIcon: "CheckmarkLargeIcon",
    ic_account_circle_24px: "UserCircleIcon",
    Info: "CircleInformationIcon",
    Warning: "WarningIcon",
    ic_message_copy: "CopyIcon",
    toast_copy_message: "CopyIcon",
    ic_chat_bubble_filled_24px: "ChatIcon",
    ic_chat_bubble_16px: "ChatIcon",
    ic_activity_24px: "GameControllerIcon",
    ActivitiesIcon: "GameControllerIcon",
    ic_locale_24px: "LanguageIcon",
    toast_copy_link: "LinkIcon",
    ic_link: "LinkIcon",
    ic_copy_message_link: "LinkIcon",
    ic_jump_to_bottom_24px: "ArrowLargeDownIcon",
    img_nitro_emojis: "ReactionIcon",
    ic_more_android: "MoreVerticalIcon",
    PlusIcon: "PlusLargeIcon",
    XIcon: "XSmallIcon",
    trash: "TrashIcon",
    ic_trash: "TrashIcon",
    ic_message_delete: "TrashIcon",
    ic_add_friend: "UserPlusIcon",
    CogIcon: "SettingsIcon",
    ic_noise_cancellation_disabled: "BellSlashIcon",
    console_detect_success: "CircleCheckIcon",
    toast_image_saved: "DownloadIcon",
    ic_message_retry: "RetryIcon",
    MentionIcon: "AtIcon",
    mention: "AtIcon",
    ic_accessibility: "AccessibilityIcon",
    ic_person: "UserIcon",
    ic_warning: "WarningIcon",
};

function lookup(name: string): number | undefined {
    indexRegistry();
    if (idsByName.has(name) || fullyLoaded) return idsByName.get(name);

    // Assets register themselves when their module first runs, so load every module once.
    fullyLoaded = true;
    for (const _ of allModules());
    indexRegistry();
    return idsByName.get(name);
}

export function findAssetId(name: string): number | undefined {
    const id = lookup(name);
    if (id !== undefined || !(name in RENAMED_ASSETS)) return id;
    return lookup(RENAMED_ASSETS[name]);
}

export function getAssetById(id: number): Asset | undefined {
    return assetsRegistry.getAssetByID(id);
}
