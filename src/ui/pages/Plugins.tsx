import { useState } from "react";
import { Alert, ScrollView } from "react-native";

import { isSafeMode } from "@/core/loader";
import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { errorToString, isHttpUrl } from "@/lib/utils";
import { clipboard, NavigationNative, url } from "@/metro/common";
import {
    builtins, disablePlugin, enablePlugin, setEnabledAndRestart, flavors, getInstance, getRecord, installPlugin, isRunning, plugins, uninstallPlugin, updatePlugin,
} from "@/plugins/manager";
import type { PluginFlavor, PluginRecord } from "@/plugins/types";
import { confirm, prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { openPage } from "@/ui/settings";
import { showToast } from "@/ui/toasts";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

export const authorsOf = (record: PluginRecord) =>
    record.manifest.authors?.map(author => typeof author === "string" ? author : author.name).join(", ");

function chooseFlavor(): Promise<PluginFlavor | "auto" | null> {
    return new Promise(resolve => {
        Alert.alert("Plugin type", "Auto-detect works for most plugins. Pick a type if detection gets it wrong.", [
            { text: "Auto-detect", onPress: () => resolve("auto") },
            ...Object.values(flavors).map(flavor => ({ text: flavor.label, onPress: () => resolve(flavor.flavor) })),
            { text: "Cancel", style: "cancel" as const, onPress: () => resolve(null) },
        ]);
    });
}

async function promptInstall(advanced: boolean) {
    const url = await prompt({ title: "Install plugin", message: "Plugin URL (folder with manifest.json, or a .js file)", confirmText: "Install" });
    if (!url) return;
    if (!isHttpUrl(url.trim())) return void showToast("That doesn't look like a URL", findAssetId("ic_warning_24px"));

    const flavor = advanced ? await chooseFlavor() : "auto";
    if (!flavor) return;

    try {
        const record = await installPlugin(url, flavor === "auto" ? undefined : flavor);
        showToast(`Installed ${record.manifest.name}`, findAssetId("CheckmarkLargeIcon"));
    } catch (e) {
        Alert.alert("Install failed", errorToString(e));
    }
}

export function PluginDetails({ id }: { id: string }) {
    useProxy(plugins);
    useProxy(builtins);
    const navigation = NavigationNative.useNavigation();
    const [busy, setBusy] = useState(false);
    const record = getRecord(id);
    if (!record) return null;
    const builtin = record.builtin;

    const Settings = getInstance(id)?.SettingsComponent;
    const run = async (action: () => Promise<unknown>, success?: string) => {
        setBusy(true);
        try {
            await action();
            if (success) showToast(success, findAssetId("CheckmarkLargeIcon"));
        } catch (e) {
            Alert.alert("Something went wrong", errorToString(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <Stack spacing={4}>
                    <Text variant="heading-lg/bold">{record.manifest.name}</Text>
                    {record.manifest.description ? <Text variant="text-md/medium" color="text-muted">{record.manifest.description}</Text> : null}
                    {authorsOf(record) ? <Text variant="text-sm/medium" color="text-muted">by {authorsOf(record)}</Text> : null}
                </Stack>

                {builtin?.warning ? (
                    <TableRowGroup title="Known issue">
                        <TableRow label="Note from the community plugin list" subLabel={builtin.warning} icon={<Icon name="ic_warning_24px" />} />
                    </TableRowGroup>
                ) : null}
                {builtin?.status === "legacy" ? (
                    <TableRowGroup title="Legacy plugin">
                        <TableRow
                            label="Written for Enmity"
                            subLabel="Enmity was discontinued in 2024, so this plugin targets an older Discord and may not work."
                            icon={<Icon name="ic_warning_24px" />}
                        />
                    </TableRowGroup>
                ) : null}

                {record.error && (
                    <TableRowGroup title="Last error">
                        <TableRow label="Failed to start" subLabel={record.error.split("\n").slice(0, 4).join("\n")} icon={<Icon name="ic_warning_24px" />} />
                    </TableRowGroup>
                )}

                <TableRowGroup title="Plugin">
                    <TableSwitchRow
                        label="Enabled"
                        subLabel={isSafeMode() ? "Safe mode is active; changes apply after leaving it." : undefined}
                        icon={<Icon name="PuzzlePieceIcon" />}
                        value={record.enabled}
                        disabled={busy}
                        onValueChange={(value: boolean) => run(async () => {
                            if (!record.builtin?.requiresRestart) return value ? enablePlugin(id) : disablePlugin(id);
                            const restart = await confirm({
                                title: `Restart to ${value ? "enable" : "disable"} ${record.manifest.name}?`,
                                message: "This plugin changes parts of Discord that are already on screen, so it can only be switched on or off with a restart.",
                                confirmText: "Restart",
                            });
                            if (restart) await setEnabledAndRestart(id, value);
                        })}
                    />
                    {!builtin && (
                        <TableSwitchRow
                            label="Update automatically"
                            icon={<Icon name="DownloadIcon" />}
                            value={record.autoUpdate}
                            onValueChange={(value: boolean) => void (record.autoUpdate = value)}
                        />
                    )}
                    {Settings && (
                        <TableRow
                            label="Settings"
                            icon={<Icon name="SettingsIcon" />}
                            arrow
                            onPress={() => openPage(record.manifest.name, () => <ErrorBoundary><Settings /></ErrorBoundary>, navigation)}
                        />
                    )}
                </TableRowGroup>

                <TableRowGroup title="Details">
                    <TableRow label="Type" icon={<Icon name="AppsIcon" />} trailing={<TableRowTrailingText text={flavors[record.flavor].label} />} />
                    {record.manifest.version ? (
                        <TableRow label="Version" icon={<Icon name="CircleInformationIcon" />} trailing={<TableRowTrailingText text={String(record.manifest.version)} />} />
                    ) : null}
                    <TableRow label="Running" icon={<Icon name="RefreshIcon" />} trailing={<TableRowTrailingText text={isRunning(id) ? "Yes" : "No"} />} />
                    {builtin ? (
                        <>
                            <TableRow label="License" icon={<Icon name="FileIcon" />} trailing={<TableRowTrailingText text={builtin.source.license} />} />
                            <TableRow
                                label="Source code"
                                subLabel={`${builtin.source.repository.replace("https://github.com/", "")} @ ${builtin.source.commit.slice(0, 7)}${builtin.source.build === "upstream-prebuilt" ? " (author's build)" : ""}`}
                                icon={<Icon name="LinkIcon" />}
                                arrow
                                onPress={() => url.openURL(`${builtin.source.repository}/tree/${builtin.source.commit}/${builtin.source.path === "." ? "" : builtin.source.path}`)}
                            />
                        </>
                    ) : (
                        <TableRow
                            label="Copy install URL"
                            subLabel={record.id}
                            icon={<Icon name="LinkIcon" />}
                            onPress={() => {
                                clipboard.setString(record.id);
                                showToast("Copied", findAssetId("CopyIcon"));
                            }}
                        />
                    )}
                </TableRowGroup>

                {!builtin && <TableRowGroup title="Manage">
                    <TableRow
                        label="Check for update"
                        icon={<Icon name="RefreshIcon" />}
                        disabled={busy}
                        onPress={() => run(async () => {
                            await updatePlugin(id);
                            if (isRunning(id)) {
                                await disablePlugin(id);
                                await enablePlugin(id);
                            }
                        }, "Plugin is up to date")}
                    />
                    <TableRow
                        label="Uninstall"
                        icon={<Icon name="TrashIcon" />}
                        variant="danger"
                        disabled={busy}
                        onPress={async () => {
                            if (!await confirm({ title: `Uninstall ${record.manifest.name}?`, message: "Its settings are deleted too.", confirmText: "Uninstall", destructive: true })) return;
                            await run(() => uninstallPlugin(id));
                            navigation.goBack();
                        }}
                    />
                </TableRowGroup>}
            </Stack>
        </ScrollView>
    );
}

export default function Plugins() {
    useProxy(plugins);
    useProxy(builtins);
    const navigation = NavigationNative.useNavigation();
    const records = Object.values(plugins).sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                {isSafeMode() && (
                    <Text variant="text-sm/medium" color="text-warning">Safe mode is active. Plugins are installed but not running.</Text>
                )}

                <TableRowGroup title="Built-in">
                    <TableRow
                        label="Plugin Library"
                        subLabel={`${Object.keys(builtins).length} plugins included with Distra, ${Object.values(builtins).filter(p => p.enabled).length} enabled`}
                        icon={<Icon name="AppsIcon" />}
                        arrow
                        onPress={() => import("./PluginLibrary").then(({ default: Library }) => openPage("Plugin Library", Library, navigation))}
                    />
                </TableRowGroup>

                <TableRowGroup title="Install">
                    <TableRow label="Install from URL" icon={<Icon name="PlusMediumIcon" />} onPress={() => promptInstall(false)} />
                    <TableRow label="Install as specific type…" icon={<Icon name="WrenchIcon" />} onPress={() => promptInstall(true)} />
                </TableRowGroup>

                <TableRowGroup title={`Installed (${records.length})`}>
                    {records.length === 0 ? (
                        <TableRow label="No plugins yet" subLabel="Vendetta, Bunny, Enmity and Aliucord plugins are supported." icon={<Icon name="PuzzlePieceIcon" />} />
                    ) : records.map(record => (
                        <TableRow
                            key={record.id}
                            label={record.manifest.name}
                            subLabel={[
                                record.error ? "Failed to start" : record.enabled ? "Enabled" : "Disabled",
                                flavors[record.flavor].label,
                                authorsOf(record),
                            ].filter(Boolean).join(" · ")}
                            icon={<Icon name={record.error ? "ic_warning_24px" : "PuzzlePieceIcon"} />}
                            arrow
                            onPress={() => openPage(record.manifest.name, () => <PluginDetails id={record.id} />, navigation)}
                        />
                    ))}
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}
