// The role sheet: a role's name, colour and id (tap to copy), and the members you have loaded who have it,
// online first (Equicord's InRole and BetterRoleContext, as one sheet).

import { useEffect, useReducer } from "react";
import { Image, ScrollView, View } from "react-native";

import { findAssetId } from "@/lib/assets";
import { findByFilePath, findByProps, findByStoreName } from "@/metro";
import { clipboard } from "@/metro/common";
import { ActionSheet, Stack, TableRow, TableRowGroup, TableRowTrailingText, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

const GuildStore = findByStoreName("GuildStore");
const GuildRoleStore = findByStoreName("GuildRoleStore");
const GuildMemberStore = findByStoreName("GuildMemberStore");
const UserStore = findByStoreName("UserStore");
const PresenceStore = findByStoreName("PresenceStore");

/** Members listed before the rest are summarised in a count. */
const MAX_LISTED = 100;

const sheets = () => findByProps("openLazy", "hideActionSheet");
const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

export function getRole(guildId: string, roleId: string): any {
    return GuildRoleStore?.getRole?.(guildId, roleId)
        ?? GuildStore?.getRole?.(guildId, roleId)
        ?? GuildStore?.getGuild?.(guildId)?.roles?.[roleId];
}

const hex = (color: number) => `#${color.toString(16).padStart(6, "0").toUpperCase()}`;

/** The role's colours as hex, one for a plain colour and two or three for a gradient; empty without a colour. */
function coloursOf(role: any): string[] {
    const colours = role?.colors;
    if (colours?.primary_color) {
        return [colours.primary_color, colours.secondary_color, colours.tertiary_color]
            .filter((value): value is number => typeof value === "number" && value > 0)
            .map(hex);
    }
    return role?.color ? [hex(role.color)] : [];
}

function copy(text: string, what: string) {
    clipboard.setString(text);
    showToast(`Copied ${what}`, findAssetId("CopyIcon"));
}

interface Member {
    userId: string;
    name: string;
    username?: string;
    avatar?: string;
    online: boolean;
}

/** Loaded members of the guild with the role (everyone for @everyone), online first. */
function membersWith(guildId: string, roleId: string): Member[] {
    const everyone = roleId === guildId;
    const members: any[] = GuildMemberStore?.getMembers?.(guildId) ?? [];
    return members
        .filter(member => everyone || member?.roles?.includes?.(roleId))
        .map(member => {
            const user = UserStore?.getUser?.(member.userId);
            const status = PresenceStore?.getStatus?.(member.userId);
            return {
                userId: member.userId,
                name: member.nick || user?.globalName || user?.username || member.userId,
                username: user?.username,
                avatar: user?.getAvatarURL?.(guildId, 64),
                online: status != null && status !== "offline" && status !== "invisible",
            };
        })
        .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

function useStores(...stores: any[]) {
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => {
        const live = stores.filter(store => store?.addChangeListener);
        live.forEach(store => store.addChangeListener(rerender));
        return () => live.forEach(store => store.removeChangeListener(rerender));
    }, []);
}

function openProfile(userId: string, guildId: string) {
    sheets()?.hideActionSheet?.();
    const profile = findByFilePath("modules/user_profile/native/showUserProfileActionSheet.tsx");
    const show = profile?.showUserProfileActionSheet ?? profile?.default;
    setTimeout(() => show?.({ userId, guildId }), 350);
}

/** Marks Discord's member list opened from the role sheet, so role mentions' redirect leaves it alone. */
export const DIRECT = Symbol.for("distra.clickableRoles.direct");

/** Discord's own member list for the role (it fetches members from Discord). */
export function openDiscordRoleMembers(props: { guildId: string; roleId: string; channelId?: string }) {
    const module = findByFilePath("modules/messages/native/RoleMembersActionSheet.tsx");
    if (!module?.default) return false;
    sheets()?.openLazy?.(Promise.resolve(module), "RoleMembersActionSheet", { ...props, [DIRECT]: true });
    return true;
}

function RoleSheet({ guildId, roleId, channelId, showAll }: { guildId: string; roleId: string; channelId?: string; showAll?: () => void }) {
    useStores(GuildMemberStore, PresenceStore, GuildRoleStore);
    const role = getRole(guildId, roleId);
    const guild = GuildStore?.getGuild?.(guildId);
    const colours = coloursOf(role);
    const members = membersWith(guildId, roleId);
    const online = members.filter(member => member.online).length;
    const listed = members.slice(0, MAX_LISTED);

    const flags = [
        role?.hoist && "Shown separately",
        role?.mentionable && "Mentionable",
        role?.managed && "Managed by an integration",
    ].filter(Boolean).join(" · ");

    const viewAll = () => {
        sheets()?.hideActionSheet?.();
        setTimeout(() => showAll ? showAll() : openDiscordRoleMembers({ guildId, roleId, channelId }), 350);
    };

    return (
        <ActionSheet>
            <ScrollView style={{ maxHeight: 560 }}>
                <Stack spacing={16} style={{ paddingBottom: 16 }}>
                    <View style={{ alignItems: "center", gap: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            {colours.length ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colours[0] }} /> : null}
                            <Text variant="heading-lg/bold" style={{ textAlign: "center" }}>{role?.name ?? "Unknown role"}</Text>
                        </View>
                        {guild?.name ? <Text variant="text-sm/medium" color="text-muted">{guild.name}</Text> : null}
                        {flags ? <Text variant="text-xs/medium" color="text-muted">{flags}</Text> : null}
                    </View>

                    <TableRowGroup title="Role">
                        <TableRow
                            label="Colour"
                            subLabel={colours.length > 1 ? "Gradient. Tap to copy" : colours.length ? "Tap to copy" : undefined}
                            icon={<Icon name="PaintPaletteIcon" />}
                            trailing={(
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                    {colours.map(colour => <View key={colour} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colour }} />)}
                                    <TableRowTrailingText text={colours.length ? colours.join(" → ") : "Default"} />
                                </View>
                            )}
                            onPress={colours.length ? () => copy(colours.join(", "), colours.length > 1 ? "colours" : "colour") : undefined}
                        />
                        <TableRow
                            label="Role ID"
                            subLabel={roleId}
                            icon={<Icon name="IdIcon" />}
                            trailing={<Icon name="CopyIcon" />}
                            onPress={() => copy(roleId, "role ID")}
                        />
                    </TableRowGroup>

                    <TableRowGroup title={`Members · ${members.length} loaded, ${online} online`}>
                        {listed.map(member => (
                            <TableRow
                                key={member.userId}
                                label={member.name}
                                subLabel={member.username && member.username !== member.name ? member.username : undefined}
                                icon={member.avatar
                                    ? <Image source={{ uri: member.avatar }} style={{ width: 32, height: 32, borderRadius: 16, opacity: member.online ? 1 : 0.5 }} />
                                    : <Icon name="UserIcon" />}
                                onPress={() => openProfile(member.userId, guildId)}
                            />
                        ))}
                        {members.length > listed.length ? (
                            <TableRow label={`${members.length - listed.length} more loaded`} icon={<Icon name="GroupIcon" />} />
                        ) : null}
                        <TableRow label="View all members" subLabel="Asks Discord for everyone with this role" icon={<Icon name="GroupIcon" />} arrow onPress={viewAll} />
                    </TableRowGroup>
                </Stack>
            </ScrollView>
        </ActionSheet>
    );
}

export function openRoleSheet(props: { guildId: string; roleId: string; channelId?: string; showAll?: () => void }) {
    sheets()?.openLazy?.(Promise.resolve({ default: RoleSheet }), "DistraRoleSheet", props);
}
