import { Alert, ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";

import { COLLAPSED_COUNTS, settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

function chooseCount() {
    Alert.alert("Badges while collapsed", "Discord shows 6.", [
        ...COLLAPSED_COUNTS.map(count => ({
            text: `${count}${settings.collapsedCount === count ? " ✓" : ""}`,
            onPress: () => void (settings.collapsedCount = count),
        })),
        { text: "Cancel", style: "cancel" as const },
    ]);
}

export default function SettingsPage() {
    useProxy(settings);

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Profile badges">
                    <TableSwitchRow
                        label="Always show every badge"
                        subLabel="No expand button; badges wrap onto as many lines as they need"
                        icon={<Icon name="RibbonIcon" />}
                        value={settings.alwaysExpand}
                        onValueChange={(value: boolean) => void (settings.alwaysExpand = value)}
                    />
                    <TableRow
                        label="Badges while collapsed"
                        subLabel="How many show before the expand button"
                        icon={<Icon name="ListBulletsIcon" />}
                        disabled={settings.alwaysExpand}
                        trailing={<TableRowTrailingText text={String(settings.collapsedCount)} />}
                        onPress={chooseCount}
                    />
                    <TableSwitchRow
                        label="Remember expanded"
                        subLabel="Keep badges expanded on every profile once you expand them, until you collapse them again"
                        icon={<Icon name="PinIcon" />}
                        disabled={settings.alwaysExpand}
                        value={settings.rememberExpanded}
                        onValueChange={(value: boolean) => void (settings.rememberExpanded = value)}
                    />
                </TableRowGroup>
                <Text variant="text-sm/medium" color="text-muted">
                    Discord shows six badges and a "+N" for the rest. With this plugin, "+N ›" expands the list in place and
                    "‹" collapses it again.
                </Text>
            </Stack>
        </ScrollView>
    );
}
