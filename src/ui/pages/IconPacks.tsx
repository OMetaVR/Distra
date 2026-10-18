import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { reloadApp } from "@/core/native";
import { settings } from "@/core/settings";
import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { getActiveIconPack, listIconPacks } from "@/lib/iconpacks";
import { DOWNLOADABLE_PACKS, downloadPack, packState, removePack, type DownloadablePack, type PackState } from "@/lib/iconpackDownloads";
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

/** "Unknown method fs.download": the installed tweak predates in-app downloads. */
const describeError = (error: unknown) => /Unknown method/.test(errorToString(error))
    ? "Update the Distra tweak (0.1.1 or newer) to download packs"
    : errorToString(error);

// Kept outside the page so a download carries on (and is shown) if you leave and come back.
const progress: Record<string, { done: number; total: number; error?: string } | undefined> = {};
const progressListeners = new Set<() => void>();
const notifyProgress = () => progressListeners.forEach(listener => listener());

function DownloadRow({ pack, installed, bundled, onChange }: { pack: DownloadablePack; installed: boolean; bundled: boolean; onChange: () => void }) {
    const [state, setState] = useState<PackState | null>(null);
    const [, rerender] = useState(0);
    useEffect(() => {
        const listener = () => rerender(x => x + 1);
        progressListeners.add(listener);
        return () => void progressListeners.delete(listener);
    }, []);
    useEffect(() => void packState(pack.id).then(setState), [installed]);

    const current = progress[pack.id];
    const running = current != null && current.error == null && current.done < current.total;

    const start = async () => {
        progress[pack.id] = { done: 0, total: 0 };
        notifyProgress();
        try {
            await downloadPack(pack.id, (done, total) => {
                progress[pack.id] = { done, total };
                notifyProgress();
            });
            progress[pack.id] = undefined;
            setState("installed");
            onChange();
        } catch (e) {
            progress[pack.id] = { ...(progress[pack.id] ?? { done: 0, total: 0 }), error: describeError(e) };
            setState(await packState(pack.id));
        }
        notifyProgress();
    };

    const remove = async () => {
        if (!await confirm({ title: `Remove ${pack.name}?`, message: "Its files are deleted from Documents/Distra/IconPacks.", confirmText: "Remove", destructive: true })) return;
        if (settings.iconPack === pack.id) await select(null);
        await removePack(pack.id);
        setState("missing");
        onChange();
    };

    if (bundled && state !== "installed" && !running) {
        return <TableRow label={pack.name} subLabel={`Included with this build · ${pack.credit}`} icon={<Icon name="CheckmarkLargeIcon" />} />;
    }

    const subLabel = running
        ? `Downloading… ${current!.done} of ${current!.total || "?"} files`
        : current?.error ? `Failed: ${current.error}`
            : state === "installed" ? `Downloaded · tap to remove · ${pack.credit}`
                : state === "outdated" ? `Update available · tap to update · ${pack.credit}`
                    : state === "partial" ? `Partly downloaded · tap to finish · ${pack.credit}`
                        : `${pack.description} · ${pack.credit}`;

    return (
        <TableRow
            label={pack.name}
            subLabel={subLabel}
            icon={<Icon name={state === "installed" ? "CheckmarkLargeIcon" : "DownloadIcon"} />}
            disabled={running}
            onPress={state === "installed" ? remove : start}
        />
    );
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

                <TableRowGroup title="Download">
                    {DOWNLOADABLE_PACKS.map(pack => (
                        <DownloadRow
                            key={pack.id}
                            pack={pack}
                            installed={(packs ?? []).some(installed => installed.id === pack.id && installed.source === "documents")}
                            bundled={(packs ?? []).some(installed => installed.id === pack.id && installed.source === "bundled")}
                            onChange={reload}
                        />
                    ))}
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Packs replace Discord's bundled images and mirror the app's assets folder layout (for example
                    rosiecord's Plumpy and Iconsax packs, which can be downloaded above). Add another pack by
                    copying its folder into Distra/IconPacks using the Files app. Packs made for older Discord versions only replace the
                    icons that still exist.
                </Text>
            </Stack>
        </ScrollView>
    );
}
