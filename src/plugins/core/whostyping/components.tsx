// Who's Typing: the pieces drawn in lists, built on Discord's own Avatar and Ellipsis (animated dots).

import { View } from "react-native";

import { findByFilePath, findByProps, findByStoreNameLazy } from "@/metro";
import { ThemeStore, useStateFromStores } from "@/metro/common";
import { resolveSemanticColor, semanticColors } from "@/ui/color";
import { Text } from "@/ui/components";

import { settings } from "./settings";
import { displayName, useTypers } from "./typing";

const UserStore = findByStoreNameLazy("UserStore");

const AVATAR = 16;
const MAX_AVATARS = 3;

let hub: any;
const Avatar = () => (hub ??= findByProps("Avatar", "AvatarSizes"))?.Avatar;
const Ellipsis = () => findByFilePath("design/void/Ellipsis/native/Ellipsis.tsx")?.default;
const useTypingText = () => findByFilePath("modules/chat/useTypingText.tsx");

/** A semantic colour token resolved for the current theme. */
function useThemeColor(token: string): string | undefined {
    const theme = useStateFromStores([ThemeStore], () => ThemeStore.theme);
    return resolveSemanticColor(semanticColors[token], theme);
}

/**
 * The three animated dots. Discord's Ellipsis leaves a trailing margin on the row (4) and on every dot (2), so
 * it is zeroed here and the dots are spaced with a gap instead: the content is then exactly as wide as the dots.
 */
export function Dots({ color }: { color?: string }) {
    const Component = Ellipsis();
    const fallback = useThemeColor("TEXT_MUTED");
    if (!Component) return null;
    const dot = { width: 4, height: 4, borderRadius: 2, marginRight: 0, backgroundColor: color ?? fallback };
    return <Component dotStyle={dot} style={{ marginRight: 0, gap: 2 }} disableScale />;
}

/** Overlapping avatars of the first few typers. */
export function Avatars({ userIds, guildId }: { userIds: string[]; guildId?: string | null }) {
    const Component = Avatar();
    const ring = useThemeColor("BACKGROUND_BASE_LOW");
    if (!Component) return null;
    const shown = userIds.slice(0, MAX_AVATARS).map(id => UserStore.getUser(id)).filter(Boolean);
    if (!shown.length) return null;
    return (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
            {shown.map((user: any, index: number) => (
                <View
                    key={user.id}
                    style={{ marginLeft: index ? -5 : 0, width: AVATAR + 2, height: AVATAR + 2, borderRadius: (AVATAR + 2) / 2, alignItems: "center", justifyContent: "center", backgroundColor: ring }}
                >
                    <Component user={user} guildId={guildId ?? undefined} size="size16" />
                </View>
            ))}
        </View>
    );
}

const wantsDots = () => settings.indicatorMode !== "avatars";
const wantsAvatars = () => settings.indicatorMode !== "dots";

function summary(userIds: string[], guildId?: string | null) {
    const names = userIds.slice(0, 3).map(id => displayName(id, guildId));
    return `${names.join(", ")}${userIds.length > 3 ? ` and ${userIds.length - 3} more` : ""} typing`;
}

/** The indicator on a server channel's row: avatars and a pill of animated dots. */
export function ChannelTypingBadge({ channelId, guildId, muted }: { channelId: string; guildId?: string | null; muted?: boolean }) {
    const typers = useTypers(channelId, guildId, muted);
    const pill = useThemeColor("BACKGROUND_MOD_STRONG");
    if (!typers.length) return null;
    return (
        <View
            accessible
            accessibilityLabel={summary(typers, guildId)}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, marginHorizontal: 4 }}
        >
            {wantsAvatars() ? <Avatars userIds={typers} guildId={guildId} /> : null}
            {wantsDots() ? (
                <View style={{ borderRadius: 10, paddingVertical: 4, paddingHorizontal: 6, backgroundColor: pill }}>
                    <Dots />
                </View>
            ) : null}
        </View>
    );
}

/**
 * What a DM row shows in place of its last message while someone types: the dots and Discord's
 * own "X is typing..." text (so it follows the app's language).
 */
export function DmTypingPreview({ channelId, muted, original }: { channelId: string; muted?: boolean; original: any }) {
    const typers = useTypers(channelId, null, muted);
    const text = useTypingText()?.default?.({ channelId, guildId: undefined, typingUserIds: typers });
    if (!typers.length) return original;
    return (
        <View accessible accessibilityLabel={summary(typers)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {wantsDots() ? <Dots /> : null}
            {wantsAvatars() && typers.length > 1 ? <Avatars userIds={typers} /> : null}
            <Text variant="text-sm/medium" color="text-muted" {...{ lineClamp: 1 }} style={{ flexShrink: 1 }}>
                {text ?? `${typers.map(id => displayName(id)).join(", ")} typing...`}
            </Text>
        </View>
    );
}
