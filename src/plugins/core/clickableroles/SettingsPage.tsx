import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Stack, TableRow, TableRowGroup, TableSwitchRow, Text } from "@/ui/components";

import { settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

export default function SettingsPage() {
    useProxy(settings);
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Open the role sheet from">
                    <TableSwitchRow
                        label="Roles in profiles"
                        subLabel="Tap a role under a member's profile"
                        icon={<Icon name="UserIcon" />}
                        value={settings.profileRoles}
                        onValueChange={(value: boolean) => void (settings.profileRoles = value)}
                    />
                    <TableSwitchRow
                        label="Role mentions"
                        subLabel="Tap an @role in chat. Off: Discord's member list, as before"
                        icon={<Icon name="AtIcon" />}
                        value={settings.roleMentions}
                        onValueChange={(value: boolean) => void (settings.roleMentions = value)}
                    />
                </TableRowGroup>
                <Text variant="text-sm/medium" color="text-muted">
                    The sheet shows the role's colour and id (tap either to copy) and the members your app has loaded
                    who have it, online first. View all members asks Discord for the full list.
                </Text>
            </Stack>
        </ScrollView>
    );
}
