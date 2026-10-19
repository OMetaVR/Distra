import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { type RoleColorSettings, settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

type Toggle = { [K in keyof RoleColorSettings]: RoleColorSettings[K] extends boolean ? K : never }[keyof RoleColorSettings];

async function editSaturation() {
    const value = await prompt({ title: "Message tint", message: "How much of the author's role color to mix into message text, 0-100.", defaultValue: String(settings.messageSaturation), confirmText: "Save" });
    if (value === null) return;
    const number = Number(value.trim());
    if (Number.isFinite(number) && number >= 0 && number <= 100) settings.messageSaturation = Math.round(number);
    else showToast("Enter a number from 0 to 100", findAssetId("ic_warning_24px"));
}

export default function SettingsPage() {
    useProxy(settings);
    const Switch = ({ label, subLabel, field, icon }: { label: string; subLabel?: string; field: Toggle; icon: string }) => (
        <TableSwitchRow label={label} subLabel={subLabel} icon={<Icon name={icon} />} value={settings[field]} onValueChange={(value: boolean) => void (settings[field] = value)} />
    );

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Show role colors in">
                    <Switch label="Mentions in chat" subLabel="@mentions of people take the color of their top role" field="chatMentions" icon="AtIcon" />
                    <Switch label="Member list role headers" field="memberList" icon="FriendsIcon" />
                    <Switch label="Voice channel users" subLabel="Names under voice channels in the channel list" field="voiceUsers" icon="VoiceNormalIcon" />
                    <Switch label="Reactions list" subLabel="Names in the sheet listing who reacted" field="reactorsList" icon="ReactionIcon" />
                </TableRowGroup>
                <TableRowGroup title="Messages">
                    <Switch label="Tint messages" subLabel="Mixes the author's role color into their message text" field="colorChatMessages" icon="PaintPaletteIcon" />
                    <TableRow
                        label="Tint strength"
                        icon={<Icon name="SettingsIcon" />}
                        disabled={!settings.colorChatMessages}
                        trailing={<TableRowTrailingText text={`${settings.messageSaturation}%`} />}
                        onPress={editSaturation}
                    />
                </TableRowGroup>
                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Discord already colors message authors, reply authors and member list names. Changes apply as messages and lists redraw.
                </Text>
            </Stack>
        </ScrollView>
    );
}
