import { useEffect, useReducer } from "react";
import { ScrollView, View } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";

import { categories, onPinsChanged } from "./data";
import { hex, settings } from "./settings";
import { openCategoryActions, openCategoryEditor } from "./sheets";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

export default function SettingsPage() {
    useProxy(settings);
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => onPinsChanged(rerender), []);
    const list = categories();

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Pinned DMs">
                    <TableRow
                        label="Order"
                        subLabel={settings.pinOrder === "recent" ? "Most recent message first" : "Your order (Move up / Move down when pinning)"}
                        icon={<Icon name="ArrowsUpDownIcon" />}
                        trailing={<TableRowTrailingText text={settings.pinOrder === "recent" ? "Recent" : "Custom"} />}
                        onPress={() => void (settings.pinOrder = settings.pinOrder === "recent" ? "custom" : "recent")}
                    />
                    <TableSwitchRow
                        label="Collapsible Direct Messages"
                        subLabel="Tap the Direct Messages header to fold away your unpinned DMs too"
                        icon={<Icon name="ChatIcon" />}
                        value={settings.canCollapseDmSection}
                        onValueChange={(value: boolean) => void (settings.canCollapseDmSection = value)}
                    />
                </TableRowGroup>

                <TableRowGroup title="Categories">
                    {list.map(category => (
                        <TableRow
                            key={category.id}
                            label={category.name}
                            subLabel={`${category.channels.length} pinned DM${category.channels.length === 1 ? "" : "s"}${category.collapsed ? " · collapsed" : ""}`}
                            icon={<View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: hex(category.color) }} />}
                            arrow
                            onPress={() => openCategoryActions(category.id)}
                        />
                    ))}
                    <TableRow label="New category" icon={<Icon name="PlusSmallIcon" />} onPress={() => openCategoryEditor({})} />
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Hold a DM in your messages list and choose Pin DM to put it in a category. Tap a category's header
                    to collapse it (unread DMs stay visible), and hold it to edit, reorder or delete it. Categories are
                    kept per account.
                </Text>
            </Stack>
        </ScrollView>
    );
}
