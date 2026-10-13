import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { rawColors, semanticColors } from "@vendetta/ui";
import { getGuildFriends } from "../index";

// UI & ActionSheet Setup
const ActionSheet = findByProps("ActionSheet")?.ActionSheet ?? RN.View;
const ASCBMod = findByProps("ActionSheetCloseButton");
const ActionSheetCloseButton = ASCBMod?.ActionSheetCloseButton;
const { openLazy, hideActionSheet } = findByProps("openLazy", "hideActionSheet") ?? {};

// Table UI components
const TableRow = findByProps("TableRow")?.TableRow ?? findByProps("FormRow")?.FormRow;
const TableRowGroup = findByProps("TableRowGroup")?.TableRowGroup ?? findByProps("FormSection")?.FormSection;

// Core Stores
const Dispatcher = findByProps("dispatch", "subscribe");
const GuildStore = findByStoreName("GuildStore");
const GuildMemberStore = findByStoreName("GuildMemberStore");
const UserStore = findByStoreName("UserStore");
const ThemeStore = findByStoreName("ThemeStore");
const GuildRoleStore = findByStoreName("GuildRoleStore");
const GuildChannelStore = findByStoreName("GuildChannelStore");
const MemberCountStore = findByProps("getMemberCount", "getOnlineCount");
const HeaderCountsStore = findByStoreName("GuildHeaderCountsStore") ?? MemberCountStore;

// Network & API Modules
const RestAPI = findByProps("get", "post", "del", "patch");

// Profile Opener
const ProfileModalModule = findByProps("openUserProfileModal", "openUserProfile") ?? findByProps("showUserProfile");

const TextStyleSheet = findByProps("TextStyleSheet")?.TextStyleSheet;
const colorModule = findByProps("colors", "unsafe_rawColors");
const colorResolver = colorModule?.internal ?? colorModule?.meta;

// --- IN-MEMORY GUILD OWNER CACHE ---
const ownerCache = new Map<string, { id: string; name: string; avatar: string | null }>();

interface Friend {
    id: string;
    username: string;
    globalName: string | null;
    nick: string | null;
}

function sc(key: string): string {
    const t = ThemeStore?.theme ?? "dark";
    const uk = key.replace(/-/g, "_").toUpperCase();
    const sym = (semanticColors as any)?.[key] ?? (semanticColors as any)?.[uk];
    if (!sym) return "#DBDCDD";
    const resolved = colorResolver?.resolveSemanticColor(t, sym);
    return typeof resolved === "string" ? resolved : "#DBDCDD";
}

function T(p: any) {
    const { style, variant, ...rest } = p;
    return (
        <RN.Text
            style={[
                variant && TextStyleSheet?.[variant as keyof typeof TextStyleSheet],
                style?.color ? {} : { color: sc("text-default") },
                style,
            ]}
            {...rest}
        />
    );
}

function FallbackRow({ label, subLabel, icon, onPress }: any) {
    return (
        <RN.TouchableOpacity
            onPress={onPress}
            disabled={!onPress}
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderBottomWidth: 0.5,
                borderBottomColor: sc("background-modifier-accent"),
            }}
        >
            {icon && <RN.View style={{ marginRight: 12 }}>{icon}</RN.View>}
            <RN.View style={{ flex: 1 }}>
                <T variant="text-md/semibold">{label}</T>
                {subLabel && (
                    <T variant="text-sm/medium" style={{ color: sc("text-muted"), marginTop: 2 }}>
                        {subLabel}
                    </T>
                )}
            </RN.View>
        </RN.TouchableOpacity>
    );
}

// Nested Friends List ActionSheet View
function ServerFriendsSheet({ friends, guildId }: { friends: Friend[]; guildId: string }) {
    const RowComponent = TableRow || FallbackRow;

    const handleFriendPress = (userId: string) => {
        try {
            hideActionSheet?.();
            if (ProfileModalModule?.openUserProfileModal) {
                ProfileModalModule.openUserProfileModal({ userId, guildId });
            } else if (ProfileModalModule?.openUserProfile) {
                ProfileModalModule.openUserProfile({ userId, guildId });
            } else if (ProfileModalModule?.showUserProfile) {
                ProfileModalModule.showUserProfile({ userId, guildId });
            }
        } catch {}
    };

    return (
        <ActionSheet>
            <RN.View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16 }}>
                <T variant="heading-md/bold" style={{ flex: 1 }}>
                    Friends in Server ({friends.length})
                </T>
                {ActionSheetCloseButton ? (
                    <ActionSheetCloseButton onPress={() => hideActionSheet?.()} />
                ) : (
                    <T variant="text-md/semibold" style={{ color: rawColors.BRAND_500 }} onPress={() => hideActionSheet?.()}>
                        Close
                    </T>
                )}
            </RN.View>

            <RN.ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 24 }}>
                {friends.length === 0 ? (
                    <RN.View style={{ paddingVertical: 20, alignItems: "center" }}>
                        <T variant="text-md/medium" style={{ color: sc("text-muted") }}>
                            No friends found in this server.
                        </T>
                    </RN.View>
                ) : (
                    friends.map((friend) => {
                        const displayName = friend.nick || friend.globalName || friend.username;
                        const handle = friend.username ? `@${friend.username}` : "";
                        const subLabel = handle && handle !== `@${displayName}` ? handle : undefined;

                        const isAnimated = UserStore?.getUser?.(friend.id)?.avatar?.startsWith("a_");
                        const avatarHash = UserStore?.getUser?.(friend.id)?.avatar;
                        const avatarUri = avatarHash
                            ? `https://cdn.discordapp.com/avatars/${friend.id}/${avatarHash}.${isAnimated ? "gif" : "png"}?size=64`
                            : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(friend.id) >> 22n) % 6n)}.png`;

                        return (
                            <RowComponent
                                key={friend.id}
                                label={displayName}
                                subLabel={subLabel}
                                icon={
                                    <RN.Image
                                        source={{ uri: avatarUri }}
                                        style={{ width: 28, height: 28, borderRadius: 14 }}
                                    />
                                }
                                onPress={() => handleFriendPress(friend.id)}
                                arrow
                            />
                        );
                    })
                )}
            </RN.ScrollView>
        </ActionSheet>
    );
}

export default function ServerInfoView({ guildId }: { guildId: string }) {
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    // Friends state management
    const [friends, setFriends] = React.useState<Friend[]>([]);
    const [friendsLoading, setFriendsLoading] = React.useState<boolean>(true);

    // Live store subscriptions
    React.useEffect(() => {
        const stores = [
            GuildStore,
            UserStore,
            GuildRoleStore,
            GuildChannelStore,
            MemberCountStore,
            HeaderCountsStore,
        ].filter(Boolean);

        for (const store of stores) {
            store?.addChangeListener?.(forceUpdate);
        }
        return () => {
            for (const store of stores) {
                store?.removeChangeListener?.(forceUpdate);
            }
        };
    }, []);

    // Fetch Friends in Guild using Gateway request
    React.useEffect(() => {
        let isMounted = true;
        setFriendsLoading(true);

        getGuildFriends(guildId)
            .then((res: Friend[]) => {
                if (isMounted) {
                    setFriends(res);
                    setFriendsLoading(false);
                }
            })
            .catch(() => {
                if (isMounted) setFriendsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [guildId]);

    const guild = GuildStore?.getGuild?.(guildId);

    // Cached owner state initialization
    const cachedOwner = ownerCache.get(guildId);
    const [ownerId, setOwnerId] = React.useState<string | null>(guild?.ownerId ?? cachedOwner?.id ?? null);
    const [ownerName, setOwnerName] = React.useState<string | null>(cachedOwner?.name ?? null);
    const [ownerAvatarHash, setOwnerAvatarHash] = React.useState<string | null>(cachedOwner?.avatar ?? null);

    // 1. Fetch Guild Owner ID if missing from Store
    React.useEffect(() => {
        if (ownerId || !RestAPI?.get) return;
        let cancelled = false;

        RestAPI.get({ url: `/guilds/${guildId}` })
            .then((res: any) => {
                if (!cancelled && res?.body?.owner_id) {
                    const fetchedOwnerId = res.body.owner_id;
                    setOwnerId(fetchedOwnerId);
                }
            })
            .catch(() => {});

        return () => { cancelled = true; };
    }, [guildId, ownerId]);

    // 2. Fetch Owner User Profile & Dispatch to Discord Store
    React.useEffect(() => {
        if (!ownerId) return;

        const storeUser = UserStore?.getUser?.(ownerId);
        if (storeUser?.username) {
            const name = storeUser.globalName ?? storeUser.username;
            setOwnerName(name);
            setOwnerAvatarHash(storeUser.avatar ?? null);
            ownerCache.set(guildId, { id: ownerId, name, avatar: storeUser.avatar ?? null });
            return;
        }

        let cancelled = false;

        const processUser = (userObj: any) => {
            if (!userObj || cancelled) return;
            const name = userObj.global_name ?? userObj.globalName ?? userObj.username;
            const avatar = userObj.avatar ?? null;

            Dispatcher?.dispatch({
                type: "USER_UPDATE",
                user: userObj,
            });

            setOwnerName(name);
            setOwnerAvatarHash(avatar);
            ownerCache.set(guildId, { id: ownerId, name, avatar });
            forceUpdate();
        };

        RestAPI.get({ url: `/users/${ownerId}` })
            .then((res: any) => processUser(res?.body))
            .catch(() => {});

        return () => { cancelled = true; };
    }, [ownerId, guildId]);

    if (!guild) return null;

    // Fast CDN Asset URL Construction
    const isAnimatedIcon = guild.icon?.startsWith("a_");
    const iconUrl = guild.icon 
        ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.${isAnimatedIcon ? "gif" : "png"}?size=256` 
        : null;

    const isAnimatedBanner = guild.banner?.startsWith("a_");
    const bannerUrl = guild.banner 
        ? `https://cdn.discordapp.com/banners/${guildId}/${guild.banner}.${isAnimatedBanner ? "gif" : "png"}?size=512` 
        : null;

    const bio = guild.description ?? null;

    // Member & Guild Metrics
    const rawMemberCount = 
        MemberCountStore?.getMemberCount?.(guildId) 
        ?? guild.memberCount 
        ?? guild.approximateMemberCount 
        ?? GuildMemberStore?.getMemberIds?.(guildId)?.length;

    const memberCount = typeof rawMemberCount === "number" ? rawMemberCount.toLocaleString() : (rawMemberCount ?? "—");
    const rawOnlineCount = HeaderCountsStore?.getOnlineCount?.(guildId) ?? MemberCountStore?.getOnlineCount?.(guildId);
    const onlineCount = typeof rawOnlineCount === "number" ? rawOnlineCount.toLocaleString() : null;

    const roleCount = GuildRoleStore?.getSortedRoles?.(guildId)?.length ?? null;
    const channelCount = GuildChannelStore?.getChannels ? Object.keys(GuildChannelStore.getChannels(guildId) ?? {}).length : null;

    // Owner Profile Details
    const ownerMember = ownerId ? GuildMemberStore?.getMember?.(guildId, ownerId) : null;
    const finalOwnerName = ownerMember?.nick ?? ownerName ?? (ownerId ? `User (${ownerId.slice(0, 6)})` : "Loading...");

    const isAnimatedAvatar = ownerAvatarHash?.startsWith("a_");
    const ownerAvatarUri = ownerAvatarHash
        ? `https://cdn.discordapp.com/avatars/${ownerId}/${ownerAvatarHash}.${isAnimatedAvatar ? "gif" : "png"}?size=64`
        : (ownerId ? `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(ownerId) >> 22n) % 6n)}.png` : null);

    const boostLevel = guild.premiumTier ?? 0;
    const boostCount = guild.premiumSubscriberCount ?? 0;
    const vanityCode = guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : null;

    const createdDate = new Date(
        Number((BigInt(guildId) >> 22n) + 1420070400000n)
    ).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

    const handleOwnerPress = () => {
        if (!ownerId) return;
        try {
            hideActionSheet?.();
            if (ProfileModalModule?.openUserProfileModal) {
                ProfileModalModule.openUserProfileModal({ userId: ownerId, guildId });
            } else if (ProfileModalModule?.openUserProfile) {
                ProfileModalModule.openUserProfile({ userId: ownerId, guildId });
            } else if (ProfileModalModule?.showUserProfile) {
                ProfileModalModule.showUserProfile({ userId: ownerId, guildId });
            }
        } catch (e) {}
    };

    const openFriendsSheet = () => {
        if (!openLazy || friendsLoading) return;
        openLazy(
            Promise.resolve({
                default: () => <ServerFriendsSheet friends={friends} guildId={guildId} />,
            }),
            "server-friends-actionsheet-" + guildId,
            {}
        );
    };

    const RowComponent = TableRow || FallbackRow;
    const GroupContainer = TableRowGroup || RN.View;

    return (
        <ActionSheet>
            <RN.View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16 }}>
                <T variant="heading-md/bold" style={{ flex: 1 }}>Server Information</T>
                {ActionSheetCloseButton ? (
                    <ActionSheetCloseButton onPress={() => hideActionSheet?.()} />
                ) : (
                    <T variant="text-md/semibold" style={{ color: rawColors.BRAND_500 }} onPress={() => hideActionSheet?.()}>
                        Close
                    </T>
                )}
            </RN.View>

            <RN.ScrollView style={{ flex: 1 }}>
                {/* Banner Header - Only renders if banner exists */}
                {bannerUrl && (
                    <RN.View style={{ width: "100%", height: 120, backgroundColor: sc("background-tertiary") }}>
                        <RN.Image
                            source={{ uri: bannerUrl }}
                            style={{ width: "100%", height: "100%", resizeMode: "cover" }}
                        />
                    </RN.View>
                )}

                {/* Left-Aligned Icon & Server Header */}
                <RN.View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
                    <RN.View style={{ flexDirection: "row", alignItems: "center" }}>
                        {iconUrl ? (
                            <RN.Image
                                source={{ uri: iconUrl }}
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 12,
                                    backgroundColor: sc("background-tertiary"),
                                }}
                            />
                        ) : (
                            <RN.View
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 12,
                                    backgroundColor: sc("background-accent"),
                                    justifyContent: "center",
                                    alignItems: "center",
                                }}
                            >
                                <T variant="heading-lg/bold">{guild.name?.slice(0, 2)}</T>
                            </RN.View>
                        )}

                        <RN.View style={{ flex: 1, marginLeft: 14 }}>
                            <T variant="heading-lg/bold" numberOfLines={2}>
                                {guild.name}
                            </T>
                        </RN.View>
                    </RN.View>

                    {/* Server Bio / Description */}
                    {bio && (
                        <T variant="text-sm/medium" style={{ color: sc("text-muted"), marginTop: 10 }}>
                            {bio}
                        </T>
                    )}
                </RN.View>

                {/* OVERVIEW SECTION */}
                <RN.View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    <GroupContainer title="OVERVIEW">
                        <RowComponent label="Members" subLabel={String(memberCount)} />
                        {onlineCount && <RowComponent label="Online" subLabel={String(onlineCount)} />}
                        
                        {/* Friends Row */}
                        <RowComponent
                            label="Friends in Server"
                            subLabel={
                                friendsLoading
                                    ? "Loading..."
                                    : `${friends.length} friend${friends.length === 1 ? "" : "s"}`
                            }
                            onPress={friendsLoading ? undefined : openFriendsSheet}
                            arrow={!friendsLoading}
                        />

                        {roleCount !== null && <RowComponent label="Roles" subLabel={String(roleCount)} />}
                        {channelCount !== null && <RowComponent label="Channels" subLabel={String(channelCount)} />}
                        <RowComponent label="Boost Status" subLabel={`Level ${boostLevel} (${boostCount} Boosts)`} />
                    </GroupContainer>
                </RN.View>

                {/* SERVER DETAILS SECTION */}
                <RN.View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
                    <GroupContainer title="SERVER DETAILS">
                        {ownerId && (
                            <RowComponent
                                label="Owner"
                                subLabel={finalOwnerName}
                                icon={
                                    ownerAvatarUri ? (
                                        <RN.Image
                                            source={{ uri: ownerAvatarUri }}
                                            style={{ width: 24, height: 24, borderRadius: 12 }}
                                        />
                                    ) : undefined
                                }
                                onPress={handleOwnerPress}
                                arrow
                            />
                        )}
                        {vanityCode && <RowComponent label="Vanity URL" subLabel={vanityCode} />}
                        <RowComponent label="Created On" subLabel={createdDate} />
                        <RowComponent label="Server ID" subLabel={guildId} />
                    </GroupContainer>
                </RN.View>
            </RN.ScrollView>
        </ActionSheet>
    );
}
