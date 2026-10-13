import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";

const { ScrollView } = ReactNative;
const { TableRowGroup, TableSwitchRow, TableRowIcon } = findByProps("TableSwitchRow", "TableRowGroup", "TableRowIcon");
const { Stack } = findByProps("Stack");

const settings = [
    {
        label: "Inject Original Edit",
        subLabel: "Replace original edit with silent edit.",
        icon: "PencilIcon",
        value: "overrideNative",
    }
];

export default function Settings() {
    useProxy(storage);

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                {TableRowGroup && (
                    <TableRowGroup title="Settings">
                        {settings.map(
                            ({ label, subLabel, icon, value }) =>
                                TableSwitchRow && (
                                    <TableSwitchRow
                                        key={value}
                                        label={label}
                                        subLabel={subLabel}
                                        icon={TableRowIcon ? <TableRowIcon source={getAssetIDByName(icon)!} /> : null}
                                        value={storage[value] ?? true}
                                        onValueChange={(v: boolean) => (storage[value] = v)}
                                    />
                                ),
                        )}
                    </TableRowGroup>
                )}
            </Stack>
        </ScrollView>
    );
}
