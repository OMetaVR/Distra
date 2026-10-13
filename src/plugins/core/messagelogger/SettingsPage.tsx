import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { NavigationNative } from "@/metro/common";
import { confirm, prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";
import { openPage } from "@/ui/settings";
import { showToast } from "@/ui/toasts";

import * as db from "./db";
import LogViewer from "./LogViewer";
import { settings } from "./settings";
import { reset } from "./state";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

async function editNumber(title: string, current: number, apply: (value: number) => void) {
    const value = await prompt({ title, defaultValue: String(current), confirmText: "Save" });
    const number = Number(value);
    if (value !== null && Number.isFinite(number) && number > 0) apply(Math.floor(number));
}

async function editColor(title: string, current: string, apply: (value: string) => void) {
    const value = await prompt({ title, message: "Hex color, e.g. #F23F43", defaultValue: current, confirmText: "Save" });
    if (value === null) return;
    if (isHex(value.trim())) apply(value.trim().toUpperCase());
    else showToast("That isn't a #RRGGBB color", findAssetId("ic_warning_24px"));
}

async function editIdList(title: string, list: string[]) {
    const value = await prompt({ title, message: "IDs separated by commas or spaces", defaultValue: list.join(", "), confirmText: "Save" });
    if (value === null) return;
    list.splice(0, list.length, ...value.split(/[\s,]+/).filter(id => /^\d{15,25}$/.test(id)));
}

export default function LoggerSettingsPage() {
    useProxy(settings);
    const navigation = NavigationNative.useNavigation();
    const [stats, setStats] = useState<Awaited<ReturnType<typeof db.stats>> | null>(null);
    const loadStats = () => void db.stats().then(setStats).catch(() => setStats(null));
    useEffect(loadStats, []);

    const Switch = ({ label, subLabel, field, icon }: { label: string; subLabel?: string; field: keyof typeof settings; icon: string }) => (
        <TableSwitchRow
            label={label}
            subLabel={subLabel}
            icon={<Icon name={icon} />}
            value={settings[field] as boolean}
            onValueChange={(value: boolean) => void ((settings as any)[field] = value)}
        />
    );

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Logs">
                    <TableRow label="View logs" subLabel="Search deleted and edited messages" icon={<Icon name="FileIcon" />} arrow onPress={() => openPage("Message Logs", LogViewer, navigation)} />
                    <TableRow
                        label="Storage"
                        icon={<Icon name="DownloadIcon" />}
                        trailing={<TableRowTrailingText text={stats ? `${stats.deleted} deleted · ${stats.edited} edited · ${formatBytes(stats.bytes)}` : "…"} />}
                    />
                    <TableRow
                        label="Clear all logs"
                        icon={<Icon name="TrashIcon" />}
                        variant="danger"
                        onPress={async () => {
                            if (!await confirm({ title: "Clear all logs?", message: "Deleted messages and edit history stored on this device are removed.", confirmText: "Clear", destructive: true })) return;
                            await db.clearAll();
                            reset();
                            loadStats();
                            showToast("Logs cleared", findAssetId("CheckmarkLargeIcon"));
                        }}
                    />
                </TableRowGroup>

                <TableRowGroup title="What to log">
                    <Switch label="Deleted messages" field="logDeletes" icon="TrashIcon" />
                    <Switch label="Edits" field="logEdits" icon="PencilIcon" />
                    <Switch label="Save images from deleted messages" subLabel="Keeps a small greyed-out copy on your device" field="saveImages" icon="ImageIcon" />
                </TableRowGroup>

                <TableRowGroup title="Ignore">
                    <Switch label="Bots" field="ignoreBots" icon="ic_badge_staff" />
                    <Switch label="My own messages" field="ignoreSelf" icon="UserIcon" />
                    <Switch label="PluralKit proxy deletes" subLabel="The original message PluralKit replaces with its proxy" field="ignorePluralKit" icon="ShieldIcon" />
                    <TableRow label="Users" subLabel={`${settings.ignoredUsers.length} ignored`} icon={<Icon name="FriendsIcon" />} arrow onPress={() => editIdList("Ignored users", settings.ignoredUsers)} />
                    <TableRow label="Channels" subLabel={`${settings.ignoredChannels.length} ignored`} icon={<Icon name="TextIcon" />} arrow onPress={() => editIdList("Ignored channels", settings.ignoredChannels)} />
                    <TableRow label="Servers" subLabel={`${settings.ignoredGuilds.length} ignored`} icon={<Icon name="ServerIcon" />} arrow onPress={() => editIdList("Ignored servers", settings.ignoredGuilds)} />
                </TableRowGroup>

                <TableRowGroup title="Appearance">
                    <Switch label="Show when it was deleted" field="showDeleteTime" icon="ClockIcon" />
                    <Switch label="Highlight deleted messages" field="highlightDeleted" icon="PaintPaletteIcon" />
                    <TableRow label="Deleted text color" icon={<Icon name="PaintPaletteIcon" />} trailing={<TableRowTrailingText text={settings.deletedTextColor} />} onPress={() => editColor("Deleted text color", settings.deletedTextColor, v => settings.deletedTextColor = v)} />
                    <TableRow label="Highlight color" icon={<Icon name="PaintPaletteIcon" />} trailing={<TableRowTrailingText text={settings.highlightColor} />} onPress={() => editColor("Highlight color", settings.highlightColor, v => settings.highlightColor = v)} />
                    <TableRow label="Edit history color" icon={<Icon name="PaintPaletteIcon" />} trailing={<TableRowTrailingText text={settings.editedTextColor} />} onPress={() => editColor("Edit history color", settings.editedTextColor, v => settings.editedTextColor = v)} />
                </TableRowGroup>

                <TableRowGroup title="Retention">
                    <TableRow label="Keep logs for" icon={<Icon name="ClockIcon" />} trailing={<TableRowTrailingText text={`${settings.retentionDays} days`} />} onPress={() => editNumber("Days to keep logs", settings.retentionDays, v => settings.retentionDays = v)} />
                    <TableRow label="Maximum logged messages" icon={<Icon name="FileIcon" />} trailing={<TableRowTrailingText text={String(settings.maxMessages)} />} onPress={() => editNumber("Maximum logged messages", settings.maxMessages, v => settings.maxMessages = v)} />
                </TableRowGroup>

                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Logs are only kept on this device. Changes to colors apply as messages re-render; retention applies on the next launch.
                </Text>
            </Stack>
        </ScrollView>
    );
}
