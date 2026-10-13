import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;
const LABELS = { online: "Online", idle: "Idle", dnd: "Do Not Disturb", streaming: "Streaming" } as const;

export default function SettingsPage() {
    useProxy(settings);

    const editColor = async (status: keyof typeof LABELS) => {
        const value = await prompt({ title: `${LABELS[status]} color`, defaultValue: settings.colors[status], confirmText: "Save" });
        if (value === null) return;
        if (/^#[0-9a-f]{6}$/i.test(value.trim())) settings.colors = { ...settings.colors, [status]: value.trim().toUpperCase() };
        else showToast("That isn't a #RRGGBB color", findAssetId("ic_warning_24px"));
    };
    const editNumber = async (field: "width" | "gap", title: string) => {
        const value = Number(await prompt({ title, defaultValue: String(settings[field]), confirmText: "Save" }));
        if (Number.isFinite(value) && value >= 0 && value <= 8) settings[field] = value;
    };

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Ring">
                    <TableRow label="Thickness" icon={<Icon name="PencilIcon" />} trailing={<TableRowTrailingText text={`${settings.width}`} />} onPress={() => editNumber("width", "Ring thickness (0-8)")} />
                    <TableRow label="Gap" icon={<Icon name="PencilIcon" />} trailing={<TableRowTrailingText text={`${settings.gap}`} />} onPress={() => editNumber("gap", "Gap between ring and avatar (0-8)")} />
                </TableRowGroup>
                <TableRowGroup title="Colors">
                    {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map(status => (
                        <TableRow key={status} label={LABELS[status]} icon={<Icon name="PaintPaletteIcon" />} trailing={<TableRowTrailingText text={settings.colors[status]} />} onPress={() => editColor(status)} />
                    ))}
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}
