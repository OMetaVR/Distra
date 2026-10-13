import { findByProps } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { semanticColors } from "@vendetta/ui";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms as UiForms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import BetterTableRowGroup from "./components/BetterTableRowGroup";

type NotificationStyle = "banner" | "toast";
type LogFilter = "all" | "servers" | "friends" | "groups";

type LogEntry = {
  content: string;
  icon: string;
  timestamp: number;
  mediaSource?: any;
  mediaShape?: "circle" | "rounded";
};

type FormRowComponent = React.ComponentType<any> & { Icon?: React.ComponentType<any> };
type FormsModule = Partial<{
  FormRow: FormRowComponent;
  FormSwitchRow: React.ComponentType<any>;
  FormDivider: React.ComponentType<any>;
  FormRadioRow: React.ComponentType<any>;
  FormCheckRow: React.ComponentType<any>;
  FormText: React.ComponentType<any>;
}>;

const { ScrollView, View, Text, Image, TextInput, Pressable } = RN;
const Forms = (
  UiForms ||
  findByProps(
    "FormRow",
    "FormSwitchRow",
    "FormDivider",
    "FormRadioRow",
    "FormCheckRow",
    "FormText",
  ) ||
  {}
) as FormsModule;
const {
  FormRow,
  FormSwitchRow,
  FormDivider,
  FormRadioRow,
  FormCheckRow,
  FormText,
} = Forms;
const ThemedText = FormText ?? Text;
const RadioRow = FormRadioRow ?? FormCheckRow ?? null;
const FormRowIcon = (FormRow as FormRowComponent | undefined)?.Icon;
const Divider = FormDivider ?? null;

const isNotificationStyle = (value: unknown): value is NotificationStyle =>
  value === "banner" || value === "toast";

const isLogEntry = (value: unknown): value is LogEntry => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.content === "string"
    && typeof entry.icon === "string"
    && typeof entry.timestamp === "number"
    && Number.isFinite(entry.timestamp)
  );
};

const sanitizeLogs = (value: unknown): LogEntry[] =>
  Array.isArray(value) ? value.filter(isLogEntry) : [];

const getAssetId = (name: string) => {
  const id = getAssetIDByName(name);
  return id || undefined;
};

const getFirstAssetId = (names: string[], fallback?: number) => {
  for (const name of names) {
    const id = getAssetId(name);
    if (id) return id;
  }
  return fallback;
};

const renderIcon = (iconId?: number, tintColor?: string) => {
  if (!iconId) return undefined;
  if (FormRowIcon) {
    return <FormRowIcon source={iconId} style={tintColor ? { tintColor } : undefined} />;
  }
  return (
    <Image
      source={iconId}
      style={{
        width: 20,
        height: 20,
        tintColor: tintColor ?? semanticColors.TEXT_MUTED,
      }}
    />
  );
};

const notificationsIconId = getAssetId("ic_notif");
const logIconId = getAssetId("empty_server_settings_audit_log_dark");
const friendsIconId = getAssetId("ic_friend_wave_24px");
const serversIconId = getFirstAssetId(
  ["ic_guild_24px", "ic_server_24px", "ic_server", "ic_guild"],
  notificationsIconId,
);
const groupsIconId = getAssetId("ic_group_dm");
const actionsIconId = getAssetId("ic_settings_24px");
const arrowRightIconId = getAssetId("ic_arrow_right");
const backIconId = getAssetId("back-icon");
const personRemoveIconId = getAssetId("ic_close_circle_24px");
const leaveGuildIconId = getAssetId("ic_close_circle_24px");
const trashIconId = getAssetId("ic_trash_24px");
const searchIconId = getFirstAssetId(["ic_search_24px", "ic_search"], logIconId);
const exportIconId = getFirstAssetId(
  ["ic_copy_24px", "ic_copy", "ic_upload_24px", "ic_upload"],
  logIconId,
);

export default () => {
  useProxy(storage);

  const [selectedPageId, setSelectedPageId] = React.useState<string | null>(null);
  const [logSearch, setLogSearch] = React.useState("");
  const [filterType, setFilterType] = React.useState<LogFilter>("all");
  const scrollRef = React.useRef<React.ElementRef<typeof ScrollView> | null>(null);

  if (!FormRow || !FormSwitchRow) {
    return null;
  }

  const logs = React.useMemo(() => sanitizeLogs(storage.logs), [storage.logs]);
  const reversedLogs = React.useMemo(() => logs.slice().reverse(), [logs]);
  const hasLogs = reversedLogs.length > 0;
  const normalizedSearch = logSearch.trim().toLowerCase();

  const filteredLogs = React.useMemo(() => {
    let result = reversedLogs;

    if (filterType !== "all") {
      result = result.filter((log) => {
        if (filterType === "servers") return log.content.toLowerCase().includes("server") || log.content.toLowerCase().includes("kicked") || log.content.toLowerCase().includes("banned");
        if (filterType === "friends") return log.content.toLowerCase().includes("friend") || log.content.toLowerCase().includes("unfriended");
        if (filterType === "groups") return log.content.toLowerCase().includes("group dm") || log.content.toLowerCase().includes("group chat");
        return true;
      });
    }

    if (!normalizedSearch) return result;
    return result.filter((log) => {
      const content = log.content?.toLowerCase?.() ?? "";
      if (content.includes(normalizedSearch)) return true;
      const timestamp = new Date(log.timestamp).toLocaleString().toLowerCase();
      return timestamp.includes(normalizedSearch);
    });
  }, [normalizedSearch, reversedLogs, filterType]);

  const hasFilteredLogs = filteredLogs.length > 0;
  const notificationStyle: NotificationStyle = isNotificationStyle(storage.notificationStyle)
    ? storage.notificationStyle
    : "banner";

  const renderTrailingArrow = () => {
    if (!arrowRightIconId) return undefined;
    if (FormRowIcon) return <FormRowIcon source={arrowRightIconId} />;
    return (
      <Image
        source={arrowRightIconId}
        style={{ width: 20, height: 20, tintColor: semanticColors.TEXT_MUTED }}
      />
    );
  };

  const renderBackIcon = () => {
    if (!backIconId) return undefined;
    if (FormRowIcon) return <FormRowIcon source={backIconId} />;
    return (
      <Image
        source={backIconId}
        style={{ width: 20, height: 20, tintColor: semanticColors.TEXT_MUTED }}
      />
    );
  };

  const exportLogs = async () => {
    if (!logs.length) {
      showToast("No logs to export.", logIconId);
      return;
    }
    const payload = JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: logs.length,
        logs,
      },
      null,
      2,
    );

    try {
      const share = (RN as any).Share?.share;
      if (typeof share === "function") {
        await share({ message: payload });
        return;
      }
    } catch {

    }

    try {
      const clipboard = (RN as any).Clipboard ?? (RN as any).clipboard;
      if (clipboard?.setString) {
        clipboard.setString(payload);
        showToast("Log JSON copied to clipboard.", logIconId);
        return;
      }
    } catch {

    }

    showToast("Unable to export logs.", logIconId);
  };

  React.useEffect(() => {
    try {
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    } catch {
      
    }
  }, [selectedPageId]);

  const renderMainList = () => (
    <>
      <BetterTableRowGroup title="Categories" icon={actionsIconId}>
        <FormRow
          label="Notifications"
          subLabel="Friend, server, and group alerts"
          leading={renderIcon(notificationsIconId)}
          trailing={renderTrailingArrow()}
          onPress={() => setSelectedPageId("notifications")}
        />
        <FormRow
          label="Logs"
          subLabel="Recent events and log actions"
          leading={renderIcon(logIconId)}
          trailing={renderTrailingArrow()}
          onPress={() => setSelectedPageId("logs")}
        />
        <FormRow
          label="Other Settings"
          subLabel="Miscellaneous options"
          leading={renderIcon(actionsIconId)}
          trailing={renderTrailingArrow()}
          onPress={() => setSelectedPageId("other")}
        />
        <FormRow
          label="Information"
          subLabel="About this plugin"
          leading={renderIcon(actionsIconId)}
          trailing={renderTrailingArrow()}
          onPress={() => setSelectedPageId("info")}
        />
      </BetterTableRowGroup>
    </>
  );

  const renderNotificationsPage = () => (
    <>
      <BetterTableRowGroup title="Servers" icon={serversIconId}>
        <FormSwitchRow
          label="Server Removals"
          subLabel="Notify when you are kicked or banned from a server."
          leading={renderIcon(leaveGuildIconId)}
          value={storage.notifyServers ?? true}
          onValueChange={(v: boolean) => (storage.notifyServers = v)}
        />
      </BetterTableRowGroup>

      <BetterTableRowGroup title="Friends" icon={friendsIconId}>
        <FormSwitchRow
          label="Friend Removals"
          subLabel="Notify when someone unfriends you."
          leading={renderIcon(personRemoveIconId)}
          value={storage.notifyFriends ?? true}
          onValueChange={(v: boolean) => (storage.notifyFriends = v)}
        />
        <RN.Pressable onPress={() => showToast("Coming soon.", notificationsIconId)}>
          <View style={{ opacity: 0.5 }} pointerEvents="none">
            <FormSwitchRow
              label="Friend Request Cancellations"
              subLabel="Coming soon."
              leading={renderIcon(personRemoveIconId)}
              value={false}
              onValueChange={() => {}}
            />
          </View>
        </RN.Pressable>
      </BetterTableRowGroup>

      <BetterTableRowGroup title="Group Chats" icon={groupsIconId}>
        <FormSwitchRow
          label="Group Chat Removals"
          subLabel="Notify when you are removed from a group DM."
          leading={renderIcon(leaveGuildIconId)}
          value={storage.notifyGroupChats ?? true}
          onValueChange={(v: boolean) => (storage.notifyGroupChats = v)}
        />
      </BetterTableRowGroup>

      <BetterTableRowGroup title="Navigation" icon={actionsIconId}>
        <FormRow
          label="Back to categories"
          leading={renderBackIcon()}
          onPress={() => setSelectedPageId(null)}
        />
      </BetterTableRowGroup>
    </>
  );

  const FilterChip = ({ label, value, active, onSelect }: { label: string, value: LogFilter, active: boolean, onSelect: (v: LogFilter) => void }) => (
    <Pressable
      onPress={() => onSelect(value)}
      style={{
        backgroundColor: active ? (semanticColors.BRAND_500 ?? "#5865f2") : (semanticColors.BACKGROUND_TERTIARY ?? "#1f2124"),
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
      }}
    >
      <Text style={{ color: active ? "#ffffff" : (semanticColors.TEXT_MUTED ?? "#b5bac1"), fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );

  const renderLogsPage = () => (
    <>
      <BetterTableRowGroup title="Search & Filter" icon={searchIconId}>
        <View style={{ padding: 16 }}>
          <TextInput
            value={logSearch}
            onChangeText={setLogSearch}
            placeholder="Search logs"
            placeholderTextColor={semanticColors.TEXT_MUTED}
            autoCorrect={false}
            autoCapitalize="none"
            style={{
              backgroundColor: semanticColors.BACKGROUND_SECONDARY ?? "#2b2d31",
              color: semanticColors.TEXT_DEFAULT ?? "#ffffff",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              marginBottom: 12,
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <FilterChip label="All" value="all" active={filterType === "all"} onSelect={setFilterType} />
            <FilterChip label="Servers" value="servers" active={filterType === "servers"} onSelect={setFilterType} />
            <FilterChip label="Friends" value="friends" active={filterType === "friends"} onSelect={setFilterType} />
            <FilterChip label="Groups" value="groups" active={filterType === "groups"} onSelect={setFilterType} />
          </View>
        </View>
      </BetterTableRowGroup>

      <BetterTableRowGroup title="Notification Log" icon={logIconId}>
        {!hasLogs ? (
          <View style={{ padding: 16, alignItems: "center" }}>
            <Text style={{ color: semanticColors.TEXT_MUTED }}>No recent events.</Text>
          </View>
        ) : !hasFilteredLogs ? (
          <View style={{ padding: 16, alignItems: "center" }}>
            <Text style={{ color: semanticColors.TEXT_MUTED }}>No matches.</Text>
          </View>
        ) : (
          <>
            {filteredLogs.map((log: LogEntry, i: number) => {
              const iconAssetId = getAssetId(log.icon);
              const mediaSource = log.mediaSource;
              const mediaShape = log.mediaShape ?? "rounded";
              
              const leading = mediaSource ? (
                <Image
                  source={mediaSource}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: mediaShape === "circle" ? 16 : 8,
                  }}
                />
              ) : renderIcon(iconAssetId);

              return (
                <View key={`${log?.timestamp ?? "log"}-${i}`}>
                  <FormRow
                    label={log.content}
                    subLabel={new Date(log.timestamp).toLocaleString()}
                    leading={leading}
                    onPress={() => {
                      showToast(log.content, iconAssetId);
                    }}
                  />
                  {i < filteredLogs.length - 1 && (Divider ? <Divider /> : null)}
                </View>
              );
            })}
            {Divider ? <Divider /> : null}
          </>
        )}
      </BetterTableRowGroup>

      {hasLogs && (
        <BetterTableRowGroup title="Log Actions" icon={actionsIconId}>
          <FormRow
            label="Export Logs (JSON)"
            subLabel="Share or copy log diagnostics"
            leading={renderIcon(exportIconId)}
            onPress={() => void exportLogs()}
          />
          <FormRow
            label="Clear Logs"
            labelStyle={{ color: "#ed4245" }}
            leading={renderIcon(trashIconId, "#ed4245")}
            onPress={() => (storage.logs = [])}
          />
        </BetterTableRowGroup>
      )}

      <BetterTableRowGroup title="Navigation" icon={actionsIconId}>
        <FormRow
          label="Back to categories"
          leading={renderBackIcon()}
          onPress={() => setSelectedPageId(null)}
        />
      </BetterTableRowGroup>
    </>
  );

  const renderOtherSettingsPage = () => (
    <>
      <BetterTableRowGroup title="Notification Style" icon={notificationsIconId}>
        {RadioRow ? (
          <>
            <RadioRow
              label="Banner"
              subLabel="Show a banner with details"
              selected={notificationStyle !== "toast"}
              leading={renderIcon(notificationsIconId)}
              onPress={() => (storage.notificationStyle = "banner")}
            />
            <RadioRow
              label="Toast"
              subLabel="Show a simple toast notification"
              selected={notificationStyle === "toast"}
              leading={renderIcon(notificationsIconId)}
              onPress={() => (storage.notificationStyle = "toast")}
            />
          </>
        ) : (
          <>
            <FormRow
              label="Banner"
              subLabel={
                notificationStyle !== "toast"
                  ? "Selected"
                  : "Show a banner with details"
              }
              leading={renderIcon(notificationsIconId)}
              onPress={() => (storage.notificationStyle = "banner")}
            />
            <FormRow
              label="Toast"
              subLabel={
                notificationStyle === "toast"
                  ? "Selected"
                  : "Show a simple toast notification"
              }
              leading={renderIcon(notificationsIconId)}
              onPress={() => (storage.notificationStyle = "toast")}
            />
          </>
        )}
      </BetterTableRowGroup>

      <BetterTableRowGroup title="Navigation" icon={actionsIconId}>
        <FormRow
          label="Back to categories"
          leading={renderBackIcon()}
          onPress={() => setSelectedPageId(null)}
        />
      </BetterTableRowGroup>
    </>
  );

  const renderInformationPage = () => (
    <>
      <BetterTableRowGroup title="Information" icon={actionsIconId} padding>
        <ThemedText style={{ color: semanticColors.TEXT_MUTED }}>
          Notifies you when you are unfriended, or removed from a group DM or server.
          It may not always work if you were offline; improvements are in progress.
        </ThemedText>
      </BetterTableRowGroup>

      <BetterTableRowGroup title="Navigation" icon={actionsIconId}>
        <FormRow
          label="Back to categories"
          leading={renderBackIcon()}
          onPress={() => setSelectedPageId(null)}
        />
      </BetterTableRowGroup>
    </>
  );

  const renderDetailPage = () => {
    const detailId = selectedPageId;
    if (detailId === "logs") return renderLogsPage();
    if (detailId === "notifications") return renderNotificationsPage();
    if (detailId === "other") return renderOtherSettingsPage();
    if (detailId === "info") return renderInformationPage();
    return null;
  };

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }}>
      {selectedPageId ? renderDetailPage() : renderMainList()}
    </ScrollView>
  );
}
