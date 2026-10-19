import { useEffect, useReducer } from "react";
import { Alert, Image, ScrollView, View } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Stack, TableRow, TableRowGroup, TableSwitchRow, Text } from "@/ui/components";

import { folderColor, folders, getIcon, onIconsChanged, resetAll, setSolidBackground } from "./data";
import { openEditor } from "./EditorSheet";
import { CustomIcon } from "./FolderIconView";
import { settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;
const PREVIEW = 32;

function DefaultFolder({ color }: { color?: number | null }) {
    return (
        <View style={{ width: PREVIEW, height: PREVIEW, borderRadius: PREVIEW / 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: folderColor(color), opacity: 0.4 }} />
            <Image source={findAssetId("FolderIcon")} style={{ width: 18, height: 18, tintColor: folderColor(color) }} />
        </View>
    );
}

export default function SettingsPage() {
    useProxy(settings);
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => onIconsChanged(rerender), []);
    const list = folders();
    const custom = list.filter(folder => getIcon(folder.id)).length;

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Folders">
                    {list.length ? list.map(folder => {
                        const icon = getIcon(folder.id);
                        return (
                            <TableRow
                                key={folder.id}
                                label={folder.name || "Unnamed folder"}
                                subLabel={`${folder.guildIds.length} server${folder.guildIds.length === 1 ? "" : "s"}${icon ? " · custom icon" : ""}`}
                                icon={icon ? <CustomIcon icon={icon} color={folder.color} size={PREVIEW} /> : <DefaultFolder color={folder.color} />}
                                arrow
                                onPress={() => openEditor(folder.id)}
                            />
                        );
                    }) : <TableRow label="No server folders" subLabel="Drag a server onto another in the server list to make one" icon={<Icon name="FolderIcon" />} />}
                </TableRowGroup>

                <TableRowGroup title="Appearance">
                    <TableSwitchRow
                        label="Solid background"
                        subLabel="Show the folder's colour behind the image at full strength"
                        icon={<Icon name="PaintPaletteIcon" />}
                        value={settings.solidBackground}
                        onValueChange={(value: boolean) => setSolidBackground(value)}
                    />
                    <TableRow
                        label="Reset all icons"
                        subLabel={custom ? `${custom} folder${custom === 1 ? "" : "s"} with a custom icon` : "No custom icons"}
                        icon={<Icon name="TrashIcon" />}
                        disabled={!custom}
                        onPress={() => Alert.alert("Reset all icons?", "Every folder goes back to showing its servers.", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Reset", style: "destructive", onPress: resetAll },
                        ])}
                    />
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Hold a folder in the server list and choose Change Icon, or pick a folder above. Closed folders show
                    the image instead of their servers.
                </Text>
            </Stack>
        </ScrollView>
    );
}
