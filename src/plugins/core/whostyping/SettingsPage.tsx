import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";

import { type IndicatorMode, settings, type WhosTypingSettings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

type Flag = { [K in keyof WhosTypingSettings]: WhosTypingSettings[K] extends boolean ? K : never }[keyof WhosTypingSettings];

const MODES: Array<{ value: IndicatorMode; label: string }> = [
    { value: "both", label: "Avatars and dots" },
    { value: "dots", label: "Animated dots" },
    { value: "avatars", label: "Avatars" },
];

export default function SettingsPage() {
    useProxy(settings);
    const Switch = ({ label, subLabel, field, icon }: { label: string; subLabel?: string; field: Flag; icon: string }) => (
        <TableSwitchRow label={label} subLabel={subLabel} icon={<Icon name={icon} />} value={settings[field]} onValueChange={(value: boolean) => void (settings[field] = value)} />
    );
    const mode = MODES.find(m => m.value === settings.indicatorMode) ?? MODES[0];

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Typing indicators">
                    <Switch label="Server channels" subLabel="A badge on channels in a server's channel list" field="serverChannels" icon="ChannelListIcon" />
                    <Switch label="Direct messages" subLabel="Shows who is typing in place of the last message" field="dmList" icon="ChatIcon" />
                    <TableRow
                        label="Indicator"
                        icon={<Icon name="ChatDotsIcon" />}
                        trailing={<TableRowTrailingText text={mode.label} />}
                        onPress={() => void (settings.indicatorMode = MODES[(MODES.indexOf(mode) + 1) % MODES.length].value)}
                    />
                    <Switch label="Include current channel" field="includeCurrentChannel" icon="EyeIcon" />
                    <Switch label="Include muted channels" field="includeMutedChannels" icon="BellSlashIcon" />
                    <Switch label="Include ignored users" field="includeIgnoredUsers" icon="EyeSlashIcon" />
                    <Switch label="Include blocked users" field="includeBlockedUsers" icon="DenyIcon" />
                </TableRowGroup>

                <TableRowGroup title="Typing line above the chat box">
                    <Switch label="Show avatars" field="showAvatars" icon="UserIcon" />
                    <Switch label="Role colours" subLabel="Colour names with their role colour" field="showRoleColors" icon="PaintPaletteIcon" />
                    <Switch label="Tap a name to open the profile" field="tappableNames" icon="FriendsIcon" />
                    <Switch label="Better text for many people" subLabel={'"A, B and 3 others are typing..." instead of "Several people are typing..."'} field="alternativeFormatting" icon="TextIcon" />
                </TableRowGroup>

                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Changes apply as lists re-render, or the next time someone starts typing.
                </Text>
            </Stack>
        </ScrollView>
    );
}
