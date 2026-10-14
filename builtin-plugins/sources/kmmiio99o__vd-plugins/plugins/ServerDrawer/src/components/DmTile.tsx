import React from "react";
import { View, Pressable, Image, StyleSheet, Text } from "react-native";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { findByProps, findByName, findByStoreName } from "@vendetta/metro";

import { ICON, RADIUS } from "../utils/metrics";

const ChatIcon = getAssetIDByName("ChatIcon");
const Haptic = findByProps("triggerHapticFeedback", "HapticFeedbackTypes");
const ChannelActions = findByProps("selectPrivateChannel");
const SelectedChannelStore = findByName("SelectedChannelStore");
const Flux = findByProps("useStateFromStores");
const NavContext = findByProps("getGuildId");

import { Themes, useTokenColor } from "../utils/theme";

function openDms() {
    Haptic?.triggerHapticFeedback?.(Haptic.HapticFeedbackTypes.SOFT);
    if (ChannelActions?.selectPrivateChannel) {
        const lastChannelId = SelectedChannelStore?.getLastSelectedChannelId?.();
        ChannelActions.selectPrivateChannel(lastChannelId);
    }
}

function useDmTileColors() {
    const selected = Flux?.useStateFromStores?.(
        [NavContext],
        () => NavContext?.getGuildId?.() == null,
    ) ?? false;

    const bgSelected = useTokenColor(Themes?.colors?.BACKGROUND_BRAND);
    const bgIdle = useTokenColor(Themes?.colors?.MOBILE_GUILDBAR_ICON_BACKGROUND_DEFAULT);
    const fgSelected = useTokenColor(Themes?.colors?.WHITE);
    const fgIdle = useTokenColor(Themes?.colors?.MOBILE_GUILDBAR_ICON_DEFAULT);

    return {
        selected,
        bg: selected ? bgSelected : bgIdle,
        tint: selected ? fgSelected : fgIdle,
    };
}

// Original drawer tile (48x48)
export default function DmTile() {
    const { bg, tint } = useDmTileColors();

    return (
        <Pressable onPress={openDms} style={st.outer}>
            <View style={[st.icon, { backgroundColor: bg }]}>
                <Image source={ChatIcon} style={{ width: 24, height: 24, tintColor: tint }} />
            </View>
        </Pressable>
    );
}

// Rail DMs tile (icon centered vertically in rail, full-height touch target)
export function RailDmTile() {
    const { tint } = useDmTileColors();

    return (
        <Pressable onPress={openDms} style={railSt.outer}>
            <View style={railSt.icon}>
                <Image source={ChatIcon} style={{ width: 24, height: 24, tintColor: tint }} />
            </View>
        </Pressable>
    );
}

const st = StyleSheet.create({
    outer: { width: ICON, height: ICON },
    icon: { width: ICON, height: ICON, borderRadius: RADIUS, alignItems: "center", justifyContent: "center" },
});

const railSt = StyleSheet.create({
    outer: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
    icon: { width: ICON, height: ICON, borderRadius: RADIUS, alignItems: "center", justifyContent: "center" },
});

const PrivateChannelReadStateStore = findByStoreName("PrivateChannelReadStateStore");
const ReadStateStore = findByStoreName("ReadStateStore");
const ChannelStore = findByStoreName("ChannelStore");
const UserStore = findByStoreName("UserStore");
const AvatarUtils = findByProps("getUserAvatarURL", "getChannelIconURL");

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** DMs and group DMs with unread messages, as Discord's own server rail lists them. */
export function useUnreadDms(): string[] {
    return Flux?.useStateFromStores?.(
        [PrivateChannelReadStateStore],
        () => PrivateChannelReadStateStore?.getUnreadPrivateChannelIds?.() ?? [],
        [],
        sameIds,
    ) ?? [];
}

/** An image source: a CDN url, or a bundled asset id for default avatars and group icons. */
function dmIcon(channel: any): string | number | undefined {
    try {
        if (channel?.type === 1) {
            const user = UserStore?.getUser?.(channel.getRecipientId?.() ?? channel.recipients?.[0]);
            return user ? AvatarUtils?.getUserAvatarURL?.(user, false, 128) : undefined;
        }
        return AvatarUtils?.getChannelIconURL?.({ id: channel.id, icon: channel.icon, applicationId: channel.application_id, size: 128 });
    } catch {
        return undefined;
    }
}

/** One unread DM: the person's (or group's) avatar with its mention count. */
export function UnreadDmTile({ channelId }: { channelId: string }) {
    const channel = Flux?.useStateFromStores?.([ChannelStore], () => ChannelStore?.getChannel?.(channelId), [channelId]);
    const mentions = Flux?.useStateFromStores?.([ReadStateStore], () => ReadStateStore?.getMentionCount?.(channelId) ?? 0, [channelId]) ?? 0;
    const icon = channel ? dmIcon(channel) : undefined;
    const source = typeof icon === "number" ? icon : icon ? { uri: icon } : undefined;

    return (
        <Pressable
            onPress={() => {
                Haptic?.triggerHapticFeedback?.(Haptic.HapticFeedbackTypes.SOFT);
                ChannelActions?.selectPrivateChannel?.(channelId);
            }}
            style={st.outer}
        >
            {source
                ? <Image source={source} style={unreadSt.avatar} />
                : <View style={[unreadSt.avatar, unreadSt.fallback]} />}
            {mentions > 0 && (
                <View style={unreadSt.outline}>
                    <View style={unreadSt.badge}>
                        <Text style={unreadSt.text}>{mentions > 99 ? "99+" : String(mentions)}</Text>
                    </View>
                </View>
            )}
        </Pressable>
    );
}

const unreadSt = StyleSheet.create({
    avatar: { width: ICON, height: ICON, borderRadius: ICON / 2 },
    fallback: { backgroundColor: "#5865f2" },
    outline: { position: "absolute", bottom: -3, right: -3, padding: 2, borderRadius: 999, backgroundColor: "#1a1a2e" },
    badge: { minWidth: 17, height: 17, borderRadius: 999, backgroundColor: "#ed4245", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
    text: { color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 17 },
});
