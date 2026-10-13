import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

const STATUS_LABELS = { online: "Online", idle: "Idle", dnd: "Do Not Disturb", streaming: "Streaming", offline: "Offline" } as const;

async function editColor(status: keyof typeof STATUS_LABELS) {
    const value = await prompt({ title: `${STATUS_LABELS[status]} color`, message: "Hex color, e.g. #23A55A", defaultValue: settings.colors[status], confirmText: "Save" });
    if (value === null) return;
    if (/^#[0-9a-f]{6}$/i.test(value.trim())) settings.colors = { ...settings.colors, [status]: value.trim().toUpperCase() };
    else showToast("That isn't a #RRGGBB color", findAssetId("ic_warning_24px"));
}

export default function SettingsPage() {
    useProxy(settings);
    const Switch = ({ label, field, icon }: { label: string; field: "memberList" | "dmList" | "dmHeader" | "profile" | "showSinglePlatform"; icon: string }) => (
        <TableSwitchRow label={label} icon={<Icon name={icon} />} value={settings[field]} onValueChange={(value: boolean) => void (settings[field] = value)} />
    );

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Show in">
                    <Switch label="Member and friend lists" field="memberList" icon="FriendsIcon" />
                    <Switch label="DM list" field="dmList" icon="ChatIcon" />
                    <Switch label="DM header" field="dmHeader" icon="ChatIcon" />
                    <Switch label="Profiles" field="profile" icon="UserIcon" />
                    <Switch label="Show when on a single device" field="showSinglePlatform" icon="MobilePhoneIcon" />
                </TableRowGroup>
                <TableRowGroup title="Colors">
                    {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map(status => (
                        <TableRow
                            key={status}
                            label={STATUS_LABELS[status]}
                            icon={<Icon name="PaintPaletteIcon" />}
                            trailing={<TableRowTrailingText text={settings.colors[status]} />}
                            onPress={() => editColor(status)}
                        />
                    ))}
                </TableRowGroup>
                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Changes apply as lists and profiles re-render.
                </Text>
            </Stack>
        </ScrollView>
    );
}
