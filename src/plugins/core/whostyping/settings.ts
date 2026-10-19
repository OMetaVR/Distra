import { createFileStorage } from "@/core/storage";

export type IndicatorMode = "both" | "dots" | "avatars";

export interface WhosTypingSettings {
    // Channel and DM lists (Equicord's TypingIndicator)
    serverChannels: boolean;
    dmList: boolean;
    indicatorMode: IndicatorMode;
    includeCurrentChannel: boolean;
    includeMutedChannels: boolean;
    includeIgnoredUsers: boolean;
    includeBlockedUsers: boolean;
    // The "X is typing..." line above the chat input (Equicord's TypingTweaks)
    showAvatars: boolean;
    showRoleColors: boolean;
    tappableNames: boolean;
    alternativeFormatting: boolean;
}

export const defaults: WhosTypingSettings = {
    serverChannels: true,
    dmList: true,
    indicatorMode: "both",
    includeCurrentChannel: true,
    includeMutedChannels: false,
    includeIgnoredUsers: false,
    includeBlockedUsers: false,
    showAvatars: true,
    showRoleColors: true,
    tappableNames: true,
    alternativeFormatting: true,
};

export let settings: WhosTypingSettings = { ...defaults };

export async function loadSettings() {
    settings = await createFileStorage<WhosTypingSettings>("plugins/data/core-whostyping.json", defaults);
}
