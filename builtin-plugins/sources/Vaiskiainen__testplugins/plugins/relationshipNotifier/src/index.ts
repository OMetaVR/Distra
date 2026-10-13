import { find, findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN, stylesheet } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { semanticColors } from "@vendetta/ui";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import Settings from "./Settings";

const Dispatcher = findByProps("dispatch", "subscribe");
const GuildStore = findByStoreName("GuildStore");
const GuildIconUtils = findByProps("getGuildIconURL");
const RelationshipStore = findByStoreName("RelationshipStore");
const UserStore = findByStoreName("UserStore");
const ChannelStore = findByStoreName("ChannelStore");
const PrivateChannelStore = findByStoreName("PrivateChannelStore");
const GuildBanStore = findByStoreName("GuildBanStore");
const UserUtils = findByProps("getUserAvatarURL", "getUserAvatarSource", "getUserAvatarURLSafe");
const ChannelIconUtils = findByProps("getChannelIconURL", "getChannelIconSource", "getChannelIconURLSafe");

const GuildActions = findByProps("leaveGuild");
const RemoveFriendActions = findByProps("removeFriend");
const CancelFriendRequestActions = findByProps("cancelFriendRequest");
const IgnoreFriendRequestActions = findByProps("ignoreFriendRequest");
const RemoveRelationshipActions = findByProps("removeRelationship");
const GroupDMActions = findByProps("leaveGroupDM");
const PrivateChannelActions = findByProps("closePrivateChannel");
const ChannelActions = findByProps("closeChannel");

let manuallyRemovedGuild: string | undefined;
const manuallyRemovedRelationships = new Map<string, number>();
const manuallyRemovedGroupDms = new Map<string, number>();

const patches: Function[] = [];

const TOAST_DURATION_MS = 2147483647;
const OFFLINE_CHECK_INITIAL_DELAY_MS = 1500;
const OFFLINE_CHECK_INTERVAL_MS = 2000;
const SNAPSHOT_WARM_DELAY_MS = 5000;
const SNAPSHOT_HEARTBEAT_MS = 120000;
const MANUAL_REMOVAL_TTL_MS = 8000;
const REMOVAL_CONFIRM_DELAY_MS = 1200;
const OFFLINE_CHECK_STABLE_MS = 3000;
const GUILD_REMOVAL_REASON_TTL_MS = 15000;
const BATCH_WINDOW_MS = 1200;
const MAX_LOGS = 50;
const MAX_NOTIFICATION_QUEUE = 50;

type NotificationStyle = "banner" | "toast";
type ServerRemovalReason = "ban" | "kick" | "removed";

type LogEntry = {
    content: string;
    icon: string;
    timestamp: number;
    mediaSource?: any;
    mediaShape?: "circle" | "rounded";
};

type SnapshotEntry = {
    id: string;
    name?: string;
    icon?: string;
};

type RelationshipSnapshotEntry = {
    id: string;
    name?: string;
    type?: number;
    avatar?: string;
};

type Snapshot = {
    guilds: SnapshotEntry[];
    relationships?: RelationshipSnapshotEntry[];
    groupDms?: SnapshotEntry[];
    capturedAt: number;
};

type StorageShape = {
    notifyServers?: boolean;
    notifyFriends?: boolean;
    notifyFriendRequests?: boolean;
    notifyGroupChats?: boolean;
    logs?: LogEntry[];
    notificationStyle?: NotificationStyle;
    snapshot?: Snapshot;
};

const storageState = storage as StorageShape;

let offlineCheckTimeout: ReturnType<typeof setTimeout> | undefined;
let offlineCheckInterval: ReturnType<typeof setInterval> | undefined;
let offlineCheckLoopStarted = false;
let offlineCheckCompleted = false;
let connectionListener: (() => void) | undefined;
let snapshotWarmTimeout: ReturnType<typeof setTimeout> | undefined;
let snapshotHeartbeatInterval: ReturnType<typeof setInterval> | undefined;
let snapshotUpdateTimeout: ReturnType<typeof setTimeout> | undefined;
let relationshipCache = new Map<string, number>();
let groupDmCache = new Set<string>();
let guildMetadataCache = new Map<string, { name?: string; icon?: string }>();

const RELATIONSHIP_TYPE_FRIEND = 1;
const RELATIONSHIP_TYPE_INCOMING = 3;
const RELATIONSHIP_TYPE_OUTGOING = 4;

const ActionSheetRoot =
    findByProps("ActionSheet")?.ActionSheet
    ?? find((mod) => mod?.render?.name === "ActionSheet");
const ActionSheetControls = findByProps("openLazy", "hideActionSheet");
const ActionSheetHeader = findByProps("ActionSheetTitleHeader", "ActionSheetCloseButton");

const openLazy = ActionSheetControls?.openLazy as
    | ((component: Promise<any>, key: string, props?: object) => void)
    | undefined;
const hideActionSheet = ActionSheetControls?.hideActionSheet as
    | (() => void)
    | undefined;
const ActionSheetTitleHeader = ActionSheetHeader?.ActionSheetTitleHeader;
const ActionSheetCloseButton = ActionSheetHeader?.ActionSheetCloseButton;

const notificationQueue: Array<{
    content: string;
    icon: string;
    mediaSource?: any;
    mediaShape?: "circle" | "rounded";
    onPress?: () => void;
    buttonLabel?: string;
    forceBanner?: boolean;
}> = [];
let notificationOpen = false;
let notificationPause = false;
let pluginActive = false;
let pendingSnapshotSignature: string | undefined;
let pendingSnapshotTimestamp = 0;
const pendingRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const guildRemovalReasons = new Map<string, { reason: ServerRemovalReason; timestamp: number }>();
let removalBatch: Array<{
    content: string;
    icon: string;
    mediaSource?: any;
    mediaShape?: "circle" | "rounded";
}> = [];
let removalBatchTimeout: ReturnType<typeof setTimeout> | undefined;

const DEFAULT_NOTIFICATION_STYLE: NotificationStyle = "banner";
const SUMMARY_NOTIFICATION_ICON = "ic_notif";

function isNotificationStyle(value: unknown): value is NotificationStyle {
    return value === "banner" || value === "toast";
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function isLogEntry(value: unknown): value is LogEntry {
    if (!value || typeof value !== "object") return false;
    const entry = value as Record<string, unknown>;
    return (
        typeof entry.content === "string"
        && typeof entry.icon === "string"
        && typeof entry.timestamp === "number"
        && Number.isFinite(entry.timestamp)
    );
}

function isTrackedRelationshipType(type?: number) {
    return (
        type === RELATIONSHIP_TYPE_FRIEND
        || type === RELATIONSHIP_TYPE_INCOMING
        || type === RELATIONSHIP_TYPE_OUTGOING
    );
}

function ensureStorageDefaults() {
    if (typeof storageState.notifyServers !== "boolean") {
        storageState.notifyServers = true;
    }
    if (typeof storageState.notifyFriends !== "boolean") {
        storageState.notifyFriends = true;
    }
    storageState.notifyFriendRequests = false;
    if (typeof storageState.notifyGroupChats !== "boolean") {
        storageState.notifyGroupChats = true;
    }

    if (!Array.isArray(storageState.logs)) {
        storageState.logs = [];
    } else {
        storageState.logs = storageState.logs.filter(isLogEntry);
    }

    if (!isNotificationStyle(storageState.notificationStyle)) {
        storageState.notificationStyle = DEFAULT_NOTIFICATION_STYLE;
    }
}

function getIconAssetId(name: string): number | undefined {
    const id = getAssetIDByName(name);
    return id || undefined;
}

function getNotificationStyle(): NotificationStyle {
    return storageState.notificationStyle === "toast" ? "toast" : DEFAULT_NOTIFICATION_STYLE;
}

function normalizeEntries(entries?: Array<SnapshotEntry | string>): SnapshotEntry[] {
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry) => (typeof entry === "string" ? { id: entry } : entry))
        .filter((entry): entry is SnapshotEntry => isNonEmptyString(entry?.id))
        .map((entry) => ({
            id: entry.id,
            name: typeof entry.name === "string" ? entry.name : undefined,
            icon: typeof entry.icon === "string" ? entry.icon : undefined,
        }));
}

function normalizeRelationshipEntries(entries?: Array<RelationshipSnapshotEntry | string>): RelationshipSnapshotEntry[] {
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry) => {
            if (typeof entry === "string") {
                return { id: entry };
            }
            if (entry && typeof entry === "object") {
                const id =
                    typeof entry.id === "string"
                        ? entry.id
                        : typeof (entry as any).userId === "string"
                            ? (entry as any).userId
                            : undefined;
                if (!isNonEmptyString(id)) return undefined;
                const type =
                    typeof entry.type === "number"
                        ? entry.type
                        : typeof (entry as any).relationshipType === "number"
                            ? (entry as any).relationshipType
                            : undefined;
                return {
                    id,
                    name: typeof entry.name === "string" ? entry.name : undefined,
                    type,
                    avatar: typeof (entry as any).avatar === "string" ? (entry as any).avatar : undefined,
                };
            }
            return undefined;
        })
        .filter((entry): entry is RelationshipSnapshotEntry => isNonEmptyString(entry?.id))
        .map((entry) => ({
            id: entry.id,
            name: typeof entry.name === "string" ? entry.name : undefined,
            type: typeof entry.type === "number" ? entry.type : undefined,
            avatar: typeof entry.avatar === "string" ? entry.avatar : undefined,
        }));
}

function toArray(value: any) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value instanceof Map) return Array.from(value.values());
    if (typeof value === "object") return Object.values(value);
    return [];
}

function isRecentManualRemoval(map: Map<string, number>, id: string) {
    const timestamp = map.get(id);
    if (!timestamp) return false;
    if (Date.now() - timestamp > MANUAL_REMOVAL_TTL_MS) {
        map.delete(id);
        return false;
    }
    return true;
}

function markManualRemoval(map: Map<string, number>, id?: string) {
    if (!isNonEmptyString(id)) return;
    map.set(id, Date.now());
}

function getCurrentUserId() {
    const current = UserStore?.getCurrentUser?.();
    return isNonEmptyString(current?.id) ? current.id : undefined;
}

function getUserDisplayNameFromUser(user: any) {
    const name =
        user?.globalName
        ?? user?.global_name
        ?? user?.displayName
        ?? user?.username
        ?? user?.name;
    return isNonEmptyString(name) ? name : undefined;
}

function getUserDisplayName(id: string) {
    const user = UserStore?.getUser?.(id);
    return getUserDisplayNameFromUser(user);
}

function getUserAvatarSource(id: string, user?: any) {
    const targetUser = user ?? UserStore?.getUser?.(id);
    if (targetUser?.avatar && UserUtils?.getUserAvatarURL) {
        try {
            const url = UserUtils.getUserAvatarURL(targetUser, 128, true);
            if (isNonEmptyString(url)) return { uri: url };
        } catch {}
    }

    const avatar = targetUser?.avatar;
    if (avatar) {
        return { uri: `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128` };
    }

    // Fallback to snapshot
    const snapshot = storageState.snapshot as Snapshot | undefined;
    const fromSnapshot = normalizeRelationshipEntries(snapshot?.relationships).find((entry) => entry.id === id);
    if (fromSnapshot?.avatar) {
        return { uri: `https://cdn.discordapp.com/avatars/${id}/${fromSnapshot.avatar}.png?size=128` };
    }

    return undefined;
}

function isGroupDmChannel(channel: any) {
    if (!channel) return false;
    if (typeof channel.isGroupDM === "function") {
        try {
            return !!channel.isGroupDM();
        } catch {}
    }
    return channel.type === 3;
}

function getChannelPairs(value: any) {
    if (!value) return [];
    if (value instanceof Map) {
        return Array.from(value.entries()).map(([id, channel]) => ({
            id: String(id),
            channel,
        }));
    }
    if (Array.isArray(value)) {
        return value
            .map((channel) => {
                const id = channel?.id ?? channel?.channel_id ?? channel?.channelId;
                return isNonEmptyString(id) ? { id: String(id), channel } : undefined;
            })
            .filter(Boolean) as Array<{ id: string; channel: any }>;
    }
    if (typeof value === "object") {
        return Object.entries(value).map(([id, channel]) => ({
            id: String(id),
            channel,
        }));
    }
    return [];
}

function getRelationshipPairs(value: any) {
    if (!value) return [];
    if (value instanceof Map) {
        return Array.from(value.entries()).map(([id, relationship]) => ({
            id: String(id),
            relationship,
        }));
    }
    if (Array.isArray(value)) {
        return value
            .map((relationship) => {
                const id =
                    relationship?.id
                    ?? relationship?.userId
                    ?? relationship?.user_id
                    ?? relationship?.user?.id;
                return isNonEmptyString(id)
                    ? { id: String(id), relationship }
                    : undefined;
            })
            .filter(Boolean) as Array<{ id: string; relationship: any }>;
    }
    if (typeof value === "object") {
        return Object.entries(value).map(([id, relationship]) => ({
            id: String(id),
            relationship,
        }));
    }
    return [];
}

function getRelationshipType(id: string, relationship: any) {
    if (typeof relationship === "number") return relationship;
    if (relationship && typeof relationship === "object") {
        if (typeof relationship.type === "number") return relationship.type;
        if (typeof relationship.relationshipType === "number") return relationship.relationshipType;
    }
    const fromStore = RelationshipStore?.getRelationshipType?.(id);
    return typeof fromStore === "number" ? fromStore : undefined;
}

function getGroupDmName(channel: any) {
    if (isNonEmptyString(channel?.name)) return channel.name;
    const recipients = channel?.recipients ?? channel?.rawRecipients ?? [];
    if (Array.isArray(recipients) && recipients.length > 0) {
        const names = recipients
            .map((recipient: any) => {
                const id = typeof recipient === "string" ? recipient : recipient?.id;
                return isNonEmptyString(id) ? getUserDisplayName(id) : undefined;
            })
            .filter((name): name is string => isNonEmptyString(name));
        if (names.length > 0) {
            const joined = names.slice(0, 3).join(", ");
            return names.length > 3 ? `${joined}…` : joined;
        }
    }
    // Fallback to snapshot
    const snapshot = storageState.snapshot as Snapshot | undefined;
    const fromSnapshot = normalizeEntries(snapshot?.groupDms).find((entry) => entry.id === (channel?.id ?? channel));
    return fromSnapshot?.name;
}

function getGroupDmIconSource(id: string, channel?: any) {
    const targetChannel = channel?.id ? channel : getChannelById(id);
    if (targetChannel?.icon && ChannelIconUtils?.getChannelIconURL) {
        try {
            const url = ChannelIconUtils.getChannelIconURL(targetChannel, 128);
            if (isNonEmptyString(url)) return { uri: url };
        } catch {}
    }
    const icon = targetChannel?.icon;
    if (icon) {
        return { uri: `https://cdn.discordapp.com/channel-icons/${id}/${icon}.png?size=128` };
    }

    // Fallback to snapshot
    const snapshot = storageState.snapshot as Snapshot | undefined;
    const fromSnapshot = normalizeEntries(snapshot?.groupDms).find((entry) => entry.id === id);
    if (fromSnapshot?.icon) {
        return { uri: `https://cdn.discordapp.com/channel-icons/${id}/${fromSnapshot.icon}.png?size=128` };
    }

    return undefined;
}

function getGuildName(id: string) {
    const guild = GuildStore?.getGuild?.(id);
    if (guild?.name) return guild.name;
    const cached = guildMetadataCache.get(id);
    if (cached?.name) return cached.name;
    const snapshot = storageState.snapshot as Snapshot | undefined;
    const fromSnapshot = normalizeEntries(snapshot?.guilds).find((entry) => entry.id === id);
    return fromSnapshot?.name;
}

function getGuildIconSource(id: string, guild?: any) {
    const targetGuild = guild ?? GuildStore?.getGuild?.(id);
    if (targetGuild?.icon && GuildIconUtils?.getGuildIconURL) {
        try {
            const url = GuildIconUtils.getGuildIconURL(targetGuild, 128, true);
            if (isNonEmptyString(url)) return { uri: url };
        } catch {}
    }
    const icon = targetGuild?.icon;
    if (icon) {
        return { uri: `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=128` };
    }

    const cached = guildMetadataCache.get(id);
    if (cached?.icon) {
        return { uri: `https://cdn.discordapp.com/icons/${id}/${cached.icon}.png?size=128` };
    }

    // Fallback to snapshot
    const snapshot = storageState.snapshot as Snapshot | undefined;
    const fromSnapshot = normalizeEntries(snapshot?.guilds).find((entry) => entry.id === id);
    if (fromSnapshot?.icon) {
        return { uri: `https://cdn.discordapp.com/icons/${id}/${fromSnapshot.icon}.png?size=128` };
    }

    return undefined;
}

function getGuildEntries(): SnapshotEntry[] {
    const guildMap = GuildStore?.getGuilds?.() || GuildStore?.guilds || {};
    const guilds = toArray(guildMap);
    return guilds
        .filter((guild) => guild?.id)
        .map((guild) => ({
            id: String(guild.id),
            name: typeof guild?.name === "string" ? guild.name : undefined,
            icon: typeof guild?.icon === "string" ? guild.icon : undefined,
        }));
}

function getRelationshipEntries(): RelationshipSnapshotEntry[] {
    const relationshipsRaw =
        RelationshipStore?.getRelationships?.()
        ?? RelationshipStore?.relationships
        ?? RelationshipStore?.getRelationshipMap?.();
    const entries = getRelationshipPairs(relationshipsRaw);
    return entries
        .map(({ id, relationship }) => {
            if (!isNonEmptyString(id)) return undefined;
            const type = getRelationshipType(id, relationship);
            if (
                type !== RELATIONSHIP_TYPE_FRIEND
                && type !== RELATIONSHIP_TYPE_INCOMING
                && type !== RELATIONSHIP_TYPE_OUTGOING
            ) {
                return undefined;
            }
            const user = relationship?.user ?? UserStore?.getUser?.(id);
            const name = getUserDisplayNameFromUser(user) ?? getUserDisplayName(id);
            return {
                id,
                name,
                type,
                avatar: typeof user?.avatar === "string" ? user.avatar : undefined,
            };
        })
        .filter((entry): entry is RelationshipSnapshotEntry => !!entry);
}

function getGroupDmEntries(): SnapshotEntry[] {
    const channelMap =
        PrivateChannelStore?.getPrivateChannels?.()
        ?? PrivateChannelStore?.getChannels?.()
        ?? PrivateChannelStore?.channels
        ?? ChannelStore?.getChannels?.()
        ?? ChannelStore?.channels
        ?? {};
    const channels = getChannelPairs(channelMap);
    return channels
        .filter(({ channel }) => isGroupDmChannel(channel))
        .map(({ id, channel }) => ({
            id,
            name: getGroupDmName(channel),
            icon: typeof channel?.icon === "string" ? channel.icon : undefined,
        }));
}

function getCurrentSnapshot(): Snapshot {
    const guilds = getGuildEntries();

    return {
        guilds,
        relationships: getRelationshipEntries(),
        groupDms: getGroupDmEntries(),
        capturedAt: Date.now(),
    };
}

function getSnapshotTotal(snapshot: Snapshot) {
    return (
        snapshot.guilds.length
        + (snapshot.relationships?.length ?? 0)
        + (snapshot.groupDms?.length ?? 0)
    );
}

function refreshRelationshipCache(snapshot?: Snapshot) {
    const entries = snapshot?.relationships ?? getRelationshipEntries();
    const next = new Map<string, number>();
    for (const entry of entries) {
        if (typeof entry.type === "number") {
            next.set(entry.id, entry.type);
        }
    }
    relationshipCache = next;
}

function refreshGroupDmCache(snapshot?: Snapshot) {
    const entries = snapshot?.groupDms ?? getGroupDmEntries();
    const next = new Set<string>();
    for (const entry of entries) {
        if (isNonEmptyString(entry.id)) next.add(entry.id);
    }
    groupDmCache = next;
}

function refreshCachesFromSnapshot(snapshot: Snapshot) {
    refreshRelationshipCache(snapshot);
    refreshGroupDmCache(snapshot);
    refreshGuildMetadataCache(snapshot);
}

function updateGuildMetadata(guild: any) {
    const id = guild?.id;
    if (!isNonEmptyString(id)) return;
    const existing = guildMetadataCache.get(id) ?? {};
    const name = typeof guild?.name === "string" ? guild.name : existing.name;
    const icon = typeof guild?.icon === "string" ? guild.icon : existing.icon;
    guildMetadataCache.set(id, { name, icon });
}

function refreshGuildMetadataCache(snapshot?: Snapshot) {
    const entries = snapshot?.guilds ?? getGuildEntries();
    for (const entry of entries) {
        guildMetadataCache.set(entry.id, { name: entry.name, icon: entry.icon });
    }
}

function getSnapshotSignature(snapshot: Snapshot) {
    const guildIds = snapshot.guilds.map((entry) => entry.id).sort().join(",");
    const relationshipIds = (snapshot.relationships ?? [])
        .map((entry) => `${entry.id}:${entry.type ?? "?"}`)
        .sort()
        .join(",");
    const groupIds = (snapshot.groupDms ?? []).map((entry) => entry.id).sort().join(",");
    return `${guildIds}|${relationshipIds}|${groupIds}`;
}

function isSnapshotStable(signature: string) {
    if (pendingSnapshotSignature !== signature) {
        pendingSnapshotSignature = signature;
        pendingSnapshotTimestamp = Date.now();
        return false;
    }
    return Date.now() - pendingSnapshotTimestamp >= OFFLINE_CHECK_STABLE_MS;
}

function scheduleOfflineCheck(delay = OFFLINE_CHECK_INITIAL_DELAY_MS) {
    if (offlineCheckTimeout) clearTimeout(offlineCheckTimeout);
    offlineCheckTimeout = setTimeout(() => {
        checkForOfflineChanges();
    }, delay);
}

function persistSnapshotIfReady(force = false) {
    const current = getCurrentSnapshot();
    if (getSnapshotTotal(current) === 0) return;
    const hasPrevious = !!storageState.snapshot;
    if (!force && hasPrevious && !offlineCheckCompleted) return;
    storageState.snapshot = current;
    refreshCachesFromSnapshot(current);
}

function stopOfflineCheckLoop() {
    if (offlineCheckTimeout) clearTimeout(offlineCheckTimeout);
    if (offlineCheckInterval) clearInterval(offlineCheckInterval);
    offlineCheckTimeout = undefined;
    offlineCheckInterval = undefined;
    offlineCheckLoopStarted = false;
}

function startOfflineCheckLoop() {
    if (offlineCheckCompleted) return;
    if (offlineCheckLoopStarted) return;
    offlineCheckLoopStarted = true;
    scheduleOfflineCheck(OFFLINE_CHECK_INITIAL_DELAY_MS);
    offlineCheckInterval = setInterval(() => {
        const completed = checkForOfflineChanges();
        if (completed) {
            offlineCheckCompleted = true;
            stopOfflineCheckLoop();
            return;
        }
    }, OFFLINE_CHECK_INTERVAL_MS);
}

function updateSnapshotSoon(delay = 250) {
    if (snapshotUpdateTimeout) clearTimeout(snapshotUpdateTimeout);
    snapshotUpdateTimeout = setTimeout(() => {
        if (!pluginActive) return;
        const snapshot = getCurrentSnapshot();
        storageState.snapshot = snapshot;
        refreshCachesFromSnapshot(snapshot);
    }, delay);
}

function addLog(
    content: string,
    icon: string,
    mediaSource?: any,
    mediaShape?: "circle" | "rounded",
) {
    if (!isNonEmptyString(content)) return;
    const logs = Array.isArray(storageState.logs) ? storageState.logs.filter(isLogEntry) : [];
    logs.push({
        content,
        icon,
        timestamp: Date.now(),
        mediaSource,
        mediaShape,
    });

    if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS);
    }
    storageState.logs = logs;
}

function scheduleRemovalConfirmation(key: string, callback: () => void) {
    if (pendingRemovalTimers.has(key)) return;
    const timeout = setTimeout(() => {
        pendingRemovalTimers.delete(key);
        callback();
    }, REMOVAL_CONFIRM_DELAY_MS);
    pendingRemovalTimers.set(key, timeout);
}

function recordGuildRemovalReason(guildId: string, reason: ServerRemovalReason) {
    guildRemovalReasons.set(guildId, { reason, timestamp: Date.now() });
}

function getRecentGuildRemovalReason(guildId: string) {
    const entry = guildRemovalReasons.get(guildId);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > GUILD_REMOVAL_REASON_TTL_MS) {
        guildRemovalReasons.delete(guildId);
        return undefined;
    }
    return entry.reason;
}

function consumeGuildRemovalReason(guildId: string) {
    const reason = getRecentGuildRemovalReason(guildId);
    if (reason) guildRemovalReasons.delete(guildId);
    return reason;
}

function isGuildBanKnown(guildId: string) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return false;
    try {
        if (GuildBanStore?.getGuildBan) {
            return !!GuildBanStore.getGuildBan(guildId, currentUserId);
        }
        if (GuildBanStore?.isBanned) {
            return !!GuildBanStore.isBanned(guildId, currentUserId);
        }
    } catch {}
    return false;
}

function resolveGuildRemovalReason(guildId: string): ServerRemovalReason {
    const recent = consumeGuildRemovalReason(guildId);
    if (recent === "ban") return "ban";
    if (isGuildBanKnown(guildId)) return "ban";
    if (recent === "kick") return "kick";
    return "removed";
}

function ActionSheetWrapper({
    title,
    onClose,
    children,
}: {
    title: string;
    onClose?: () => void;
    children?: any;
}) {
    if (!ActionSheetRoot) return null;
    const header = ActionSheetTitleHeader && ActionSheetCloseButton
        ? React.createElement(ActionSheetTitleHeader, {
            title,
            trailing: React.createElement(ActionSheetCloseButton, {
                onPress: onClose ?? (() => hideActionSheet?.()),
            }),
        })
        : null;

    return React.createElement(
        ActionSheetRoot,
        null,
        header,
        React.createElement(RN.View, null, children),
    );
}

function NotificationSheet({
    message,
    icon,
    mediaSource,
    mediaShape,
    onDismiss,
    onAction,
    actionLabel,
}: {
    message: string;
    icon: string;
    mediaSource?: any;
    mediaShape?: "circle" | "rounded";
    onDismiss: () => void;
    onAction?: () => void;
    actionLabel?: string;
}) {
    const styles = stylesheet.createThemedStyleSheet({
        container: {
            paddingHorizontal: 16,
            paddingBottom: 16,
            alignItems: "center",
        },
        row: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginTop: 8,
        },
        media: {
            width: 44,
            height: 44,
            borderRadius: mediaShape === "circle" ? 22 : 10,
            backgroundColor: semanticColors?.BACKGROUND_SECONDARY ?? "#2b2d31",
        },
        icon: {
            width: 20,
            height: 20,
            tintColor: semanticColors?.TEXT_DEFAULT ?? "#ffffff",
        },
        message: {
            flexShrink: 1,
            fontSize: 15,
            color: semanticColors?.TEXT_DEFAULT ?? "#ffffff",
            textAlign: "center",
        },
        button: {
            marginTop: 12,
            alignSelf: "center",
            backgroundColor: semanticColors?.BRAND_500 ?? "#5865f2",
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            minWidth: 120,
            alignItems: "center",
        },
        buttonText: {
            color: "#ffffff",
            fontSize: 14,
            fontWeight: "600",
        },
        secondaryButton: {
            marginTop: 12,
            alignSelf: "center",
            backgroundColor: semanticColors?.BACKGROUND_TERTIARY ?? "#1f2124",
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            minWidth: 120,
            alignItems: "center",
        },
        secondaryButtonText: {
            color: semanticColors?.TEXT_DEFAULT ?? "#ffffff",
            fontSize: 14,
            fontWeight: "600",
        },
    });
    const iconAssetId = getIconAssetId(icon);

    return React.createElement(
        ActionSheetWrapper,
        { title: "Relationship Notifier", onClose: onDismiss },
        React.createElement(
            RN.View,
            { style: styles.container },
            React.createElement(
            RN.View,
            { style: styles.row },
            mediaSource
                ? React.createElement(RN.Image, {
                    source: mediaSource,
                    style: styles.media,
                    resizeMode: "cover",
                })
                : null,
            iconAssetId
                ? React.createElement(RN.Image, {
                    source: iconAssetId,
                    style: styles.icon,
                    resizeMode: "cover",
                })
                : null,
                React.createElement(RN.Text, { style: styles.message }, message),
            ),
            onAction
                ? React.createElement(
                    RN.Pressable,
                    { style: styles.secondaryButton, onPress: onAction },
                    React.createElement(
                        RN.Text,
                        { style: styles.secondaryButtonText },
                        actionLabel || "View list",
                    ),
                )
                : null,
            React.createElement(
                RN.Pressable,
                { style: styles.button, onPress: onDismiss },
                React.createElement(RN.Text, { style: styles.buttonText }, "Dismiss"),
            ),
        ),
    );
}

function openNotificationSheet(
    content: string,
    icon: string,
    mediaSource?: any,
    mediaShape?: "circle" | "rounded",
    onAction?: () => void,
    actionLabel?: string,
) {
    if (!openLazy || !ActionSheetRoot) return false;
    try {
        openLazy(
            Promise.resolve({ default: NotificationSheet }),
            "RelationshipNotifier",
            {
                message: content,
                icon,
                mediaSource,
                mediaShape,
                onDismiss: () => hideActionSheet?.(),
                onAction,
                actionLabel,
            },
        );
        return true;
    } catch {
        return false;
    }
}

function BatchListSheet({
    items,
    onClose,
}: {
    items: Array<{
        content: string;
        icon: string;
        mediaSource?: any;
        mediaShape?: "circle" | "rounded";
    }>;
    onClose: () => void;
}) {
    const styles = stylesheet.createThemedStyleSheet({
        container: {
            paddingHorizontal: 16,
            paddingBottom: 16,
        },
        subtitle: {
            color: semanticColors?.TEXT_MUTED ?? "#b5bac1",
            fontSize: 13,
            textAlign: "center",
            marginBottom: 12,
        },
        list: {
            maxHeight: 360,
        },
        row: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 8,
        },
        media: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: semanticColors?.BACKGROUND_SECONDARY ?? "#2b2d31",
        },
        icon: {
            width: 18,
            height: 18,
            tintColor: semanticColors?.TEXT_MUTED ?? "#b5bac1",
        },
        text: {
            flexShrink: 1,
            color: semanticColors?.TEXT_DEFAULT ?? "#ffffff",
            fontSize: 14,
        },
        button: {
            marginTop: 12,
            alignSelf: "center",
            backgroundColor: semanticColors?.BRAND_500 ?? "#5865f2",
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            minWidth: 120,
            alignItems: "center",
        },
        buttonText: {
            color: "#ffffff",
            fontSize: 14,
            fontWeight: "600",
        },
    });

    return React.createElement(
        ActionSheetWrapper,
        { title: "Recent removals", onClose },
        React.createElement(
            RN.View,
            { style: styles.container },
            React.createElement(
                RN.Text,
                { style: styles.subtitle },
                `${items.length} item${items.length === 1 ? "" : "s"}`,
            ),
            React.createElement(
                RN.ScrollView,
                { style: styles.list },
                items.map((item, index) => {
                    const iconAssetId = getIconAssetId(item.icon);
                    const radius = item.mediaShape === "rounded" ? 10 : 18;
                    return React.createElement(
                        RN.View,
                        { key: `${item.content}-${index}`, style: styles.row },
                        item.mediaSource
                            ? React.createElement(RN.Image, {
                                source: item.mediaSource,
                                style: { ...styles.media, borderRadius: radius },
                                resizeMode: "cover",
                            })
                            : iconAssetId
                                ? React.createElement(RN.Image, {
                                    source: iconAssetId,
                                    style: styles.icon,
                                    resizeMode: "cover",
                                })
                                : null,
                        React.createElement(RN.Text, { style: styles.text }, item.content),
                    );
                }),
            ),
            React.createElement(
                RN.Pressable,
                { style: styles.button, onPress: onClose },
                React.createElement(RN.Text, { style: styles.buttonText }, "Close"),
            ),
        ),
    );
}

function openBatchListSheet(items: Array<{
    content: string;
    icon: string;
    mediaSource?: any;
    mediaShape?: "circle" | "rounded";
}>) {
    if (!openLazy || !ActionSheetRoot) return false;
    try {
        openLazy(
            Promise.resolve({ default: BatchListSheet }),
            "RelationshipNotifierBatch",
            {
                items,
                onClose: () => {
                    try { hideActionSheet?.(); } catch {}
                },
            },
        );
        return true;
    } catch {
        return false;
    }
}

function showNextNotification() {
    if (!pluginActive) {
        notificationQueue.length = 0;
        return;
    }
    if (notificationPause) return;
    const next = notificationQueue.shift();
    if (!next) return;
    const style = getNotificationStyle();
    const useToast = style === "toast" && !next.forceBanner && !next.onPress;
    if (useToast) {
        showToast(next.content, getIconAssetId(next.icon), TOAST_DURATION_MS);
        if (notificationQueue.length > 0) setTimeout(showNextNotification, 0);
        return;
    }

    if (notificationOpen) {
        notificationQueue.unshift(next);
        return;
    }

    if (
        openNotificationSheet(
            next.content,
            next.icon,
            next.mediaSource,
            next.mediaShape,
            next.onPress,
            next.buttonLabel,
        )
    ) {
        notificationOpen = true;
        return;
    }

    showToast(next.content, getIconAssetId(next.icon), TOAST_DURATION_MS);
}

function enqueueNotification(
    content: string,
    icon: string,
    mediaSource?: any,
    mediaShape?: "circle" | "rounded",
    options?: {
        onPress?: () => void;
        buttonLabel?: string;
        forceBanner?: boolean;
    },
) {
    if (notificationQueue.length >= MAX_NOTIFICATION_QUEUE) {
        notificationQueue.shift();
    }
    notificationQueue.push({
        content,
        icon,
        mediaSource,
        mediaShape,
        onPress: options?.onPress,
        buttonLabel: options?.buttonLabel,
        forceBanner: options?.forceBanner,
    });
    showNextNotification();
}

function notify(
    content: string,
    icon: string,
    mediaSource?: any,
    mediaShape?: "circle" | "rounded",
    options?: {
        skipLog?: boolean;
        onPress?: () => void;
        buttonLabel?: string;
        forceBanner?: boolean;
    },
) {
    if (!pluginActive) return;
    if (!options?.skipLog) addLog(content, icon);
    enqueueNotification(content, icon, mediaSource, mediaShape, {
        onPress: options?.onPress,
        buttonLabel: options?.buttonLabel,
        forceBanner: options?.forceBanner,
    });
}

function queueRemovalNotification(
    content: string,
    icon: string,
    mediaSource?: any,
    mediaShape?: "circle" | "rounded",
) {
    if (!pluginActive) return;
    addLog(content, icon);
    removalBatch.push({ content, icon, mediaSource, mediaShape });
    if (removalBatchTimeout) clearTimeout(removalBatchTimeout);
    removalBatchTimeout = setTimeout(() => {
        const batch = removalBatch;
        removalBatch = [];
        removalBatchTimeout = undefined;
        if (batch.length === 0) return;
        if (batch.length === 1) {
            const single = batch[0];
            notify(
                single.content,
                single.icon,
                single.mediaSource,
                single.mediaShape,
                { skipLog: true },
            );
            return;
        }
        const listItems = batch.map((item) => ({ ...item }));
        const countLabel = `${batch.length} removal${batch.length === 1 ? "" : "s"} detected.`;
        notify(
            `${countLabel} Tap to view list.`,
            SUMMARY_NOTIFICATION_ICON,
            undefined,
            undefined,
            {
                skipLog: true,
                forceBanner: true,
                buttonLabel: "View list",
                onPress: () => {
                    notificationPause = true;
                    try { hideActionSheet?.(); } catch {}
                    setTimeout(() => {
                        const opened = openBatchListSheet(listItems);
                        if (!opened) {
                            notificationPause = false;
                            setTimeout(showNextNotification, 0);
                        }
                    }, 0);
                },
            },
        );
    }, BATCH_WINDOW_MS);
}

function notifyServerRemoved(id: string, name: string, iconSource?: any, reason: ServerRemovalReason = "removed") {
    const verb =
        reason === "ban"
            ? "banned from"
            : reason === "kick"
                ? "kicked from"
                : "removed from";
    queueRemovalNotification(
        `You were ${verb} ${name}.`,
        "ic_leave_guild_24px",
        iconSource || getGuildIconSource(id),
        "rounded",
    );
}

function notifyFriendRemoved(id: string, name: string, mediaSource?: any) {
    queueRemovalNotification(
        `You were unfriended by ${name}.`,
        "ic_close_circle_24px",
        mediaSource || getUserAvatarSource(id),
        "circle",
    );
}

function notifyFriendRequestCanceled(id: string, name: string, type?: number, mediaSource?: any) {
    const direction = type === RELATIONSHIP_TYPE_INCOMING
        ? "from"
        : type === RELATIONSHIP_TYPE_OUTGOING
            ? "to"
            : "with";
    queueRemovalNotification(
        `Friend request ${direction} ${name} was canceled.`,
        "ic_close_circle_24px",
        mediaSource || getUserAvatarSource(id),
        "circle",
    );
}

function notifyGroupDmRemoved(id: string, name?: string, mediaSource?: any) {
    const label = name || "a group DM";
    queueRemovalNotification(
        `You were removed from ${label}.`,
        "ic_leave_guild_24px",
        mediaSource || getGroupDmIconSource(id),
        "rounded",
    );
}

function checkForOfflineChanges(): boolean {
    if (!pluginActive) return false;
    const current = getCurrentSnapshot();
    const previousRaw = storageState.snapshot as Snapshot | undefined;
    const signature = getSnapshotSignature(current);

    if (!previousRaw) {
        const currentTotal = getSnapshotTotal(current);
        if (currentTotal === 0) return false;
        if (!isSnapshotStable(signature)) return false;
        storageState.snapshot = current;
        refreshCachesFromSnapshot(current);
        pendingSnapshotSignature = undefined;
        return true;
    }

    const previous: Snapshot = {
        guilds: normalizeEntries(previousRaw.guilds),
        relationships: normalizeRelationshipEntries(previousRaw.relationships),
        groupDms: normalizeEntries(previousRaw.groupDms),
        capturedAt: previousRaw.capturedAt || 0,
    };

    const currentGuildSet = new Set(current.guilds.map((entry) => entry.id));
    const currentRelationshipMap = new Map(
        (current.relationships ?? []).map((entry) => [entry.id, entry.type]),
    );
    const currentGroupDmSet = new Set((current.groupDms ?? []).map((entry) => entry.id));

    const previousTotal = getSnapshotTotal(previous);
    const currentTotal = getSnapshotTotal(current);

    if (currentTotal === 0 && previousTotal > 0) {
        return false;
    }

    if (!isSnapshotStable(signature)) {
        return false;
    }

    if (storageState.notifyServers) {
        for (const entry of previous.guilds) {
            if (currentGuildSet.has(entry.id)) continue;
            const name = entry.name || "a server";
            const iconSource = entry.icon
                ? { uri: `https://cdn.discordapp.com/icons/${entry.id}/${entry.icon}.png?size=128` }
                : undefined;
            const reason = resolveGuildRemovalReason(entry.id);
            notifyServerRemoved(entry.id, name, iconSource, reason);
        }
    }

    if (storageState.notifyFriends || storageState.notifyFriendRequests) {
        for (const entry of previous.relationships ?? []) {
            if (currentRelationshipMap.has(entry.id)) continue;
            const name = entry.name || "a friend";
            const mediaSource = entry.avatar
                ? { uri: `https://cdn.discordapp.com/avatars/${entry.id}/${entry.avatar}.png?size=128` }
                : undefined;

            if (entry.type === RELATIONSHIP_TYPE_FRIEND) {
                if (storageState.notifyFriends) {
                    notifyFriendRemoved(entry.id, name, mediaSource);
                }
            } else if (
                entry.type === RELATIONSHIP_TYPE_INCOMING
                || entry.type === RELATIONSHIP_TYPE_OUTGOING
            ) {
                if (storageState.notifyFriendRequests) {
                    notifyFriendRequestCanceled(entry.id, name, entry.type, mediaSource);
                }
            }
        }
    }

    if (storageState.notifyGroupChats) {
        for (const entry of previous.groupDms ?? []) {
            if (currentGroupDmSet.has(entry.id)) continue;
            const name = entry.name || "a group DM";
            const mediaSource = entry.icon
                ? { uri: `https://cdn.discordapp.com/channel-icons/${entry.id}/${entry.icon}.png?size=128` }
                : undefined;
            notifyGroupDmRemoved(entry.id, name, mediaSource);
        }
    }

    storageState.snapshot = current;
    refreshCachesFromSnapshot(current);
    pendingSnapshotSignature = undefined;
    return true;
}

function onGuildDelete(event: any) {
    if (!pluginActive) return;
    if (!event || !event.guild) return;
    const { guild } = event;
    const { id, unavailable } = guild as { id?: string; unavailable?: boolean; name?: string };
    if (!id) return;
    updateGuildMetadata(guild);
    const eventName = typeof guild?.name === "string" ? guild.name : undefined;

    // Ignore if it's just a temporary outage
    if (unavailable) return;

    if (manuallyRemovedGuild === id) {
        manuallyRemovedGuild = undefined;
        updateSnapshotSoon();
        return;
    }

    const guildName = eventName || getGuildName(id) || "a server";
    const iconSource = getGuildIconSource(id, guild);
    scheduleRemovalConfirmation(`guild:${id}`, () => {
        if (manuallyRemovedGuild === id) {
            manuallyRemovedGuild = undefined;
            updateSnapshotSoon();
            return;
        }
        if (GuildStore?.getGuild?.(id)) {
            return;
        }
        if (storageState.notifyServers) {
            const reason = resolveGuildRemovalReason(id);
            notifyServerRemoved(id, guildName, iconSource, reason);
        }
        updateSnapshotSoon();
    });
}

function parseRelationshipPayload(payload: any) {
    if (!payload) return { id: undefined, type: undefined, user: undefined };
    const relationship =
        payload.relationship
        ?? payload.relationships
        ?? payload.data?.relationship
        ?? payload;
    const user = relationship?.user ?? payload.user ?? payload.data?.user;
    const id =
        relationship?.id
        ?? relationship?.userId
        ?? relationship?.user_id
        ?? payload.userId
        ?? payload.user_id
        ?? payload.id
        ?? user?.id;
    const type =
        relationship?.type
        ?? relationship?.relationshipType
        ?? payload.relationshipType
        ?? payload.type;
    return {
        id: isNonEmptyString(id) ? String(id) : undefined,
        type: typeof type === "number" ? type : undefined,
        user,
    };
}

function onRelationshipRemove(event: any) {
    if (!pluginActive) return;
    const { id, type, user } = parseRelationshipPayload(event);
    if (!id) return;

    if (isRecentManualRemoval(manuallyRemovedRelationships, id)) {
        manuallyRemovedRelationships.delete(id);
        relationshipCache.delete(id);
        updateSnapshotSoon();
        return;
    }

    const previousType = type ?? relationshipCache.get(id);
    const name = getUserDisplayNameFromUser(user) || getUserDisplayName(id) || "a friend";
    const mediaSource = getUserAvatarSource(id, user);

    scheduleRemovalConfirmation(`rel:${id}`, () => {
        const currentType = RelationshipStore?.getRelationshipType?.(id);
        if (isTrackedRelationshipType(currentType)) {
            if (typeof currentType === "number") relationshipCache.set(id, currentType);
            return;
        }

        if (previousType === RELATIONSHIP_TYPE_FRIEND) {
            if (storageState.notifyFriends) {
                notifyFriendRemoved(id, name, mediaSource);
            }
        } else if (
            previousType === RELATIONSHIP_TYPE_INCOMING
            || previousType === RELATIONSHIP_TYPE_OUTGOING
        ) {
            if (storageState.notifyFriendRequests) {
                notifyFriendRequestCanceled(id, name, previousType, mediaSource);
            }
        }

        relationshipCache.delete(id);
        updateSnapshotSoon();
    });
}

function onRelationshipUpdate(event: any) {
    if (!pluginActive) return;
    const { id, type } = parseRelationshipPayload(event);
    if (!id) return;
    if (typeof type === "number") {
        if (isTrackedRelationshipType(type)) {
            relationshipCache.set(id, type);
        } else {
            relationshipCache.delete(id);
        }
    } else {
        refreshRelationshipCache();
    }
    updateSnapshotSoon();
}

function getChannelById(id: string) {
    return (
        ChannelStore?.getChannel?.(id)
        ?? PrivateChannelStore?.getChannel?.(id)
        ?? PrivateChannelStore?.getPrivateChannel?.(id)
    );
}

function onChannelDelete(event: any) {
    if (!pluginActive) return;
    const channel = event?.channel ?? event?.data?.channel ?? event;
    const id = channel?.id ?? event?.channelId ?? event?.channel_id ?? event?.id;
    if (!isNonEmptyString(id)) return;
    const resolvedChannel = channel?.id ? channel : getChannelById(id);
    if (!isGroupDmChannel(resolvedChannel)) return;

    if (isRecentManualRemoval(manuallyRemovedGroupDms, id)) {
        manuallyRemovedGroupDms.delete(id);
        groupDmCache.delete(id);
        updateSnapshotSoon();
        return;
    }

    const name = getGroupDmName(resolvedChannel) || "a group DM";
    const iconSource = getGroupDmIconSource(id, resolvedChannel);
    scheduleRemovalConfirmation(`gdm:${id}`, () => {
        const currentChannel = getChannelById(id);
        if (isGroupDmChannel(currentChannel)) {
            return;
        }
        if (storageState.notifyGroupChats) {
            notifyGroupDmRemoved(id, name, iconSource);
        }
        groupDmCache.delete(id);
        updateSnapshotSoon();
    });
}

function onChannelRecipientRemove(event: any) {
    if (!pluginActive) return;
    const userId = event?.userId ?? event?.user_id ?? event?.user?.id;
    if (userId && userId !== getCurrentUserId()) return;
    const channelId = event?.channelId ?? event?.channel_id ?? event?.channel?.id;
    if (!isNonEmptyString(channelId)) return;
    const channel = getChannelById(channelId) ?? event?.channel;
    if (!isGroupDmChannel(channel)) return;
    onChannelDelete({ channel, channelId });
}

function safeSubscribe(event: string, handler: (payload: any) => void) {
    try {
        Dispatcher?.subscribe?.(event, handler);
        return true;
    } catch {
        return false;
    }
}

function safeUnsubscribe(event: string, handler: (payload: any) => void) {
    try {
        Dispatcher?.unsubscribe?.(event, handler);
    } catch {}
}

function onGuildBanAdd(event: any) {
    if (!pluginActive) return;
    const guildId = event?.guildId ?? event?.guild_id ?? event?.guild?.id;
    const userId = event?.user?.id ?? event?.userId ?? event?.user_id;
    if (!isNonEmptyString(guildId) || !isNonEmptyString(userId)) return;
    if (userId !== getCurrentUserId()) return;
    recordGuildRemovalReason(String(guildId), "ban");
}

function onGuildMemberRemove(event: any) {
    if (!pluginActive) return;
    const guildId = event?.guildId ?? event?.guild_id ?? event?.guild?.id;
    const userId = event?.user?.id ?? event?.userId ?? event?.user_id;
    if (!isNonEmptyString(guildId) || !isNonEmptyString(userId)) return;
    if (userId !== getCurrentUserId()) return;
    recordGuildRemovalReason(String(guildId), "kick");
}

function onGuildCreate(event: any) {
    if (!pluginActive) return;
    const guild = event?.guild ?? event?.data?.guild ?? event;
    if (!guild?.id) return;
    updateGuildMetadata(guild);
    updateSnapshotSoon();
}

function onGuildUpdate(event: any) {
    if (!pluginActive) return;
    const guild = event?.guild ?? event?.data?.guild ?? event;
    if (!guild?.id) return;
    updateGuildMetadata(guild);
    updateSnapshotSoon();
}

export default {
    onLoad: () => {
        pluginActive = true;

        // Initialize storage
        ensureStorageDefaults();
        refreshRelationshipCache();
        refreshGroupDmCache();
        refreshGuildMetadataCache();

        // Patch actions to detect manual removals
        if (GuildActions) {
            try {
                patches.push(before("leaveGuild", GuildActions, ([id]) => {
                    if (typeof id === "string") {
                        manuallyRemovedGuild = id;
                    }
                }));
            } catch {}
        }

        if (RemoveFriendActions?.removeFriend) {
            try {
                patches.push(before("removeFriend", RemoveFriendActions, ([id]) => {
                    markManualRemoval(manuallyRemovedRelationships, id);
                }));
            } catch {}
        }
        if (CancelFriendRequestActions?.cancelFriendRequest) {
            try {
                patches.push(before("cancelFriendRequest", CancelFriendRequestActions, ([id]) => {
                    markManualRemoval(manuallyRemovedRelationships, id);
                }));
            } catch {}
        }
        if (IgnoreFriendRequestActions?.ignoreFriendRequest) {
            try {
                patches.push(before("ignoreFriendRequest", IgnoreFriendRequestActions, ([id]) => {
                    markManualRemoval(manuallyRemovedRelationships, id);
                }));
            } catch {}
        }
        if (RemoveRelationshipActions?.removeRelationship) {
            try {
                patches.push(before("removeRelationship", RemoveRelationshipActions, ([id]) => {
                    markManualRemoval(manuallyRemovedRelationships, id);
                }));
            } catch {}
        }
        if (GroupDMActions?.leaveGroupDM) {
            try {
                patches.push(before("leaveGroupDM", GroupDMActions, ([id]) => {
                    markManualRemoval(manuallyRemovedGroupDms, id);
                }));
            } catch {}
        }
        if (PrivateChannelActions?.closePrivateChannel) {
            try {
                patches.push(before("closePrivateChannel", PrivateChannelActions, ([id]) => {
                    if (!isNonEmptyString(id)) return;
                    const channel = getChannelById(id);
                    if (isGroupDmChannel(channel)) {
                        markManualRemoval(manuallyRemovedGroupDms, id);
                    }
                }));
            } catch {}
        }
        if (ChannelActions?.closeChannel) {
            try {
                patches.push(before("closeChannel", ChannelActions, ([id]) => {
                    if (!isNonEmptyString(id)) return;
                    const channel = getChannelById(id);
                    if (isGroupDmChannel(channel)) {
                        markManualRemoval(manuallyRemovedGroupDms, id);
                    }
                }));
            } catch {}
        }

        if (ActionSheetControls?.hideActionSheet) {
            try {
                patches.push(after("hideActionSheet", ActionSheetControls, () => {
                    if (notificationPause && !notificationOpen) {
                        notificationPause = false;
                        setTimeout(showNextNotification, 0);
                        return;
                    }
                    if (!notificationOpen) return;
                    notificationOpen = false;
                    if (!notificationPause) {
                        setTimeout(showNextNotification, 0);
                    }
                }));
            } catch {}
        }

        // Subscribe to dispatcher events
        safeSubscribe("GUILD_CREATE", onGuildCreate);
        safeSubscribe("GUILD_UPDATE", onGuildUpdate);
        safeSubscribe("GUILD_DELETE", onGuildDelete);
        safeSubscribe("GUILD_BAN_ADD", onGuildBanAdd);
        safeSubscribe("GUILD_MEMBER_REMOVE", onGuildMemberRemove);
        safeSubscribe("RELATIONSHIP_REMOVE", onRelationshipRemove);
        safeSubscribe("RELATIONSHIP_UPDATE", onRelationshipUpdate);
        safeSubscribe("RELATIONSHIP_ADD", onRelationshipUpdate);
        safeSubscribe("CHANNEL_DELETE", onChannelDelete);
        safeSubscribe("CHANNEL_RECIPIENT_REMOVE", onChannelRecipientRemove);

        offlineCheckLoopStarted = false;
        offlineCheckCompleted = false;
        connectionListener = () => {
            startOfflineCheckLoop();
            if (connectionListener) {
                safeUnsubscribe("CONNECTION_OPEN", connectionListener);
                safeUnsubscribe("CONNECTION_OPEN_SUPPLEMENTAL", connectionListener);
            }
            if (snapshotWarmTimeout) clearTimeout(snapshotWarmTimeout);
            snapshotWarmTimeout = setTimeout(() => {
                persistSnapshotIfReady();
            }, SNAPSHOT_WARM_DELAY_MS);
        };
        safeSubscribe("CONNECTION_OPEN", connectionListener);
        safeSubscribe("CONNECTION_OPEN_SUPPLEMENTAL", connectionListener);
        startOfflineCheckLoop();

        if (snapshotHeartbeatInterval) clearInterval(snapshotHeartbeatInterval);
        snapshotHeartbeatInterval = setInterval(() => {
            persistSnapshotIfReady();
        }, SNAPSHOT_HEARTBEAT_MS);
    },

    onUnload: () => {
        pluginActive = false;

        // Unsubscribe from dispatcher
        safeUnsubscribe("GUILD_CREATE", onGuildCreate);
        safeUnsubscribe("GUILD_UPDATE", onGuildUpdate);
        safeUnsubscribe("GUILD_DELETE", onGuildDelete);
        safeUnsubscribe("GUILD_BAN_ADD", onGuildBanAdd);
        safeUnsubscribe("GUILD_MEMBER_REMOVE", onGuildMemberRemove);
        safeUnsubscribe("RELATIONSHIP_REMOVE", onRelationshipRemove);
        safeUnsubscribe("RELATIONSHIP_UPDATE", onRelationshipUpdate);
        safeUnsubscribe("RELATIONSHIP_ADD", onRelationshipUpdate);
        safeUnsubscribe("CHANNEL_DELETE", onChannelDelete);
        safeUnsubscribe("CHANNEL_RECIPIENT_REMOVE", onChannelRecipientRemove);
        if (connectionListener) {
            safeUnsubscribe("CONNECTION_OPEN", connectionListener);
            safeUnsubscribe("CONNECTION_OPEN_SUPPLEMENTAL", connectionListener);
            connectionListener = undefined;
        }

        // Remove patches
        for (const unpatch of patches) unpatch();
        patches.length = 0;

        try {
            persistSnapshotIfReady(true);
        } catch {}

        if (offlineCheckTimeout) clearTimeout(offlineCheckTimeout);
        if (offlineCheckInterval) clearInterval(offlineCheckInterval);
        if (snapshotUpdateTimeout) clearTimeout(snapshotUpdateTimeout);
        if (snapshotWarmTimeout) clearTimeout(snapshotWarmTimeout);
        if (snapshotHeartbeatInterval) clearInterval(snapshotHeartbeatInterval);
        offlineCheckLoopStarted = false;
        offlineCheckCompleted = false;
        pendingSnapshotSignature = undefined;
        pendingSnapshotTimestamp = 0;
        manuallyRemovedGuild = undefined;
        manuallyRemovedRelationships.clear();
        manuallyRemovedGroupDms.clear();
        relationshipCache.clear();
        groupDmCache.clear();
        guildMetadataCache.clear();
        for (const timeout of pendingRemovalTimers.values()) clearTimeout(timeout);
        pendingRemovalTimers.clear();
        guildRemovalReasons.clear();
        if (removalBatchTimeout) clearTimeout(removalBatchTimeout);
        removalBatchTimeout = undefined;
        removalBatch = [];

        notificationQueue.length = 0;
        notificationOpen = false;
        notificationPause = false;
        try { hideActionSheet?.(); } catch {}
    },

    settings: Settings,
}
