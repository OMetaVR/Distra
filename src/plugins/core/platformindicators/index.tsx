// Platform indicators: shows which devices (desktop, mobile, web, console) a user is
// online on, colored by their status. Rebuilt for Discord's current (minified) UI from
// martinz64's PlatformIndicators, with BetterStatusIndicator's per-status colors.

import { View } from "react-native";

import { afterComponentRender, findElement, textOf } from "@/lib/components";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByStoreNameLazy } from "@/metro";

import { definePlugin } from "../types";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";
import StatusIcons from "./StatusIcons";

const logger = new Logger("PlatformIndicators");
const UserStore = findByStoreNameLazy("UserStore");
const ChannelStore = findByStoreNameLazy("ChannelStore");
const RelationshipStore = findByStoreNameLazy("RelationshipStore");
const GuildMemberStore = findByStoreNameLazy("GuildMemberStore");

const FILES = {
    userRow: "modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx",
    dmItem: "modules/main_tabs_v2/native/tabs/messages/items/channel/MessagesItemChannelContent.tsx",
    dmHeader: "modules/main_tabs_v2/native/channel/header/PrivateChannelHeader.tsx",
    profile: "modules/user_profile/native/UserProfilePrimaryInfo.tsx",
};

/** Every name a user might be displayed under. */
function namesOf(userId: string, guildId?: string): string[] {
    const user = UserStore.getUser?.(userId);
    return [
        guildId && GuildMemberStore.getNick?.(guildId, userId),
        RelationshipStore.getNickname?.(userId),
        user?.globalName,
        user?.global_name,
        user?.username,
    ].filter((name): name is string => typeof name === "string" && name.length > 0);
}

/**
 * Puts the icons right after the element showing the user's name: that element is
 * replaced in place by a row of [name, icons].
 */
function inject(element: any, userId: string | undefined, key: string, guildId?: string, size?: number) {
    if (!userId || findElement(element, node => node?.key === key)) return;
    const names = namesOf(userId, guildId);
    const nameElement = findElement(element, node => {
        const text = textOf(node);
        return text != null && names.includes(text);
    });
    if (!nameElement) return;

    const original = { ...nameElement };
    nameElement.type = View;
    nameElement.key = key;
    nameElement.props = {
        style: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
        children: [original, <StatusIcons key="icons" userId={userId} size={size} />],
    };
}

/** Finds a user id in props, or anywhere in the rendered tree. */
const userIdIn = (props: any, element: any): string | undefined =>
    props?.user?.id ?? props?.userId ?? findElement(element, node => node?.props?.user?.id)?.props.user.id;

const recipientOf = (channel: any): string | undefined => channel?.getRecipientId?.() ?? channel?.recipients?.[0];

let patcher = createPatcher("PlatformIndicators");

export default definePlugin({
    id: "discordia:platform-indicators",
    manifest: {
        name: "Platform Indicators",
        description: "Shows which devices people are online on (desktop, mobile, web, console) in member lists, DMs and profiles, colored by status.",
        authors: [{ name: "Discordia" }, { name: "martinz64 (PlatformIndicators)" }, { name: "mafu (BetterStatusIndicator)" }],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        patcher = createPatcher("PlatformIndicators");

        const results = {
            userRow: afterComponentRender(patcher, FILES.userRow, (props, element) => {
                if (settings.memberList) inject(element, userIdIn(props, element), "discordia-pi-row", props?.guildId);
            }),
            dmItem: afterComponentRender(patcher, FILES.dmItem, (props, element) => {
                const channel = props?.channel;
                if (settings.dmList && channel && !channel.isMultiUserDM?.()) inject(element, recipientOf(channel), "discordia-pi-dm");
            }),
            dmHeader: afterComponentRender(patcher, FILES.dmHeader, (props, element) => {
                const channel = props?.channel ?? ChannelStore.getChannel?.(props?.channelId);
                if (settings.dmHeader && channel && !channel.isMultiUserDM?.()) inject(element, recipientOf(channel), "discordia-pi-header");
            }),
            profile: afterComponentRender(patcher, FILES.profile, (props, element) => {
                if (settings.profile) inject(element, userIdIn(props, element), "discordia-pi-profile", props?.guildId, 18);
            }),
        };
        const missing = Object.entries(results).filter(([, ok]) => !ok).map(([name]) => name);
        if (missing.length) logger.warn(`Could not hook: ${missing.join(", ")}`);
    },

    stop() {
        patcher.unpatchAll();
    },

    SettingsComponent: SettingsPage,
});
