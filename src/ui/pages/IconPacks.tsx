import { ScrollView } from "react-native";

import { reloadApp } from "@/core/native";
import { settings } from "@/core/settings";
import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { getActiveIconPack, listIconPacks } from "@/lib/iconpacks";
import { errorToString } from "@/lib/utils";
import { confirm } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, Text } from "@/ui/components";
import { useAsync } from "@/ui/hooks/useAsync";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;
const Check = () => <TableRow.Icon source={findAssetId("CheckmarkLargeIcon")} />;

async function select(id: string | null) {
    if (settings.iconPack === id) return;
    settings.iconPack = id;
    if (await confirm({ title: "Reload Discord?", message: "Icon packs are applied when Discord reloads.", confirmText: "Reload" })) {
        setTimeout(reloadApp, 300);
    }
}

export default function IconPacks() {
    useProxy(settings);
    const { value: packs, error, loading, reload } = useAsync(listIconPacks);
    const applied = getActiveIconPack();

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Icon pack">
                    <TableRow
                        label="Discord default"
                        icon={<Icon name="ImageIcon" />}
                        trailing={settings.iconPack === null ? <Check /> : undefined}
                        onPress={() => select(null)}
                    />
                    {(packs ?? []).map(pack => (
                        <TableRow
                            key={pack.id}
                            label={pack.name}
                            subLabel={[
                                pack.source === "bundled" ? "Included with this build" : "Documents/Distra/IconPacks",
                                applied === pack.id ? "applied" : settings.iconPack === pack.id ? "applies after reload" : null,
                            ].filter(Boolean).join(" · ")}
                            icon={<Icon name="PaintPaletteIcon" />}
                            trailing={settings.iconPack === pack.id ? <Check /> : undefined}
                            onPress={() => select(pack.id)}
                        />
                    ))}
                    {error ? <TableRow label="Couldn't list icon packs" subLabel={errorToString(error)} icon={<Icon name="ic_warning_24px" />} /> : null}
                    <TableRow label={loading ? "Loading…" : "Refresh"} icon={<Icon name="RefreshIcon" />} onPress={reload} />
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Packs replace Discord's bundled images and mirror the app's assets folder layout (for example
                    rosiecord's Plumpy and Iconsax packs). Add a pack by copying its folder into
                    Distra/IconPacks using the Files app. Packs made for older Discord versions only replace the
                    icons that still exist.
                </Text>
            </Stack>
        </ScrollView>
    );
}
