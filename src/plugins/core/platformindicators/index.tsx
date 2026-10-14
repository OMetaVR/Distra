// Platform indicators: shows which devices (desktop, mobile, web, console) a user is
// online on, colored by their status. Rebuilt for Discord's current (minified) UI from
// martinz64's PlatformIndicators, with BetterStatusIndicator's per-status colors.

import { createContext, useContext } from "react";
import { View } from "react-native";

import { afterComponentRender, findElement, textOf } from "@/lib/components";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { find, findByStoreNameLazy } from "@/metro";
import { fromPredicate } from "@/metro/filters";

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

/**
 * Names are usually rendered by UsernameWithEffects (memo), often inside components the
 * location hooks below can't see into. The hooks provide this context around their output;
 * UsernameWithEffects adds the icons when its user is the one the context is for.
 */
type IndicatorTarget = { userId: string; size?: number };
// Created on first use: Discord's React isn't loaded yet when this module is evaluated.
let indicatorContext: React.Context<IndicatorTarget | null> | undefined;
const IndicatorContext = () => indicatorContext ??= createContext<IndicatorTarget | null>(null);

const isUsernameWithEffects = fromPredicate(m => m?.$$typeof != null && m.type?.name === "UsernameWithEffects", "usernameWithEffects");

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
    if (!userId) return;
    const { Provider } = IndicatorContext();
    const provided = <Provider value={{ userId, size }}>{element}</Provider>;
    if (findElement(element, node => node?.key === key)) return provided;
    const names = namesOf(userId, guildId);
    const nameElement = findElement(element, node => {
        const text = textOf(node);
        return text != null && names.includes(text);
    });
    if (!nameElement) return provided;

    const original = { ...nameElement };
    nameElement.type = View;
    nameElement.key = key;
    nameElement.props = {
        style: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
        children: [original, <StatusIcons key="icons" userId={userId} size={size} />],
    };
    return element;
}

/** Finds a user id in props, or anywhere in the rendered tree. */
const userIdIn = (props: any, element: any): string | undefined =>
    props?.user?.id ?? props?.userId ?? findElement(element, node => node?.props?.user?.id)?.props.user.id;

const recipientOf = (channel: any): string | undefined => channel?.getRecipientId?.() ?? channel?.recipients?.[0];

let patcher = createPatcher("PlatformIndicators");

export default definePlugin({
    id: "distra:platform-indicators",
    manifest: {
        name: "Platform Indicators",
        description: "Shows which devices people are online on (desktop, mobile, web, console) in member lists, DMs and profiles, colored by status.",
        authors: [{ name: "Distra" }, { name: "martinz64 (PlatformIndicators)" }, { name: "mafu (BetterStatusIndicator)" }],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        patcher = createPatcher("PlatformIndicators");

        const results = {
            userRow: afterComponentRender(patcher, FILES.userRow, (props, element) => {
                if (settings.memberList) return inject(element, userIdIn(props, element), "distra-pi-row", props?.guildId);
            }),
            dmItem: afterComponentRender(patcher, FILES.dmItem, (props, element) => {
                const channel = props?.channel;
                if (settings.dmList && channel && !channel.isMultiUserDM?.()) return inject(element, recipientOf(channel), "distra-pi-dm");
            }),
            dmHeader: afterComponentRender(patcher, FILES.dmHeader, (props, element) => {
                const channel = props?.channel ?? ChannelStore.getChannel?.(props?.channelId);
                if (settings.dmHeader && channel && !channel.isMultiUserDM?.()) return inject(element, recipientOf(channel), "distra-pi-header");
            }),
            profile: afterComponentRender(patcher, FILES.profile, (props, element) => {
                if (settings.profile) return inject(element, userIdIn(props, element), "distra-pi-profile", props?.guildId, 18);
            }),
        };
        const username = find(isUsernameWithEffects);
        if (username) {
            patcher.after("type", username, ([props]: any[], element: any) => {
                // A hook: called on every render of the patched component, so the call order is stable.
                const context = useContext(IndicatorContext());
                if (!element || !context || props?.userId !== context.userId) return;
                return (
                    <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
                        <View style={{ flexShrink: 1 }}>{element}</View>
                        <StatusIcons userId={context.userId} size={context.size} />
                    </View>
                );
            });
        }
        const missing = [...Object.entries(results).filter(([, ok]) => !ok).map(([name]) => name), ...(username ? [] : ["UsernameWithEffects"])];
        if (missing.length) logger.warn(`Could not hook: ${missing.join(", ")}`);
    },

    stop() {
        patcher.unpatchAll();
    },

    SettingsComponent: SettingsPage,
});
