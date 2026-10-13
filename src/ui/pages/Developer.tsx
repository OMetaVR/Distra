import { useEffect, useReducer } from "react";
import { Alert, ScrollView } from "react-native";

import { callNative } from "@/core/bridge";
import { loader } from "@/core/loader";
import { reloadApp } from "@/core/native";
import { loaderConfig } from "@/core/settings";
import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { getLogEntries, subscribeLogs } from "@/lib/logger";
import { clearMetroCache } from "@/metro/cache";
import { clipboard, NavigationNative } from "@/metro/common";
import { Stack, TableRow, TableRowGroup, TableSwitchRow, Text, TextInput } from "@/ui/components";
import { openPage } from "@/ui/settings";
import { showToast } from "@/ui/toasts";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

const LEVEL_COLORS: Record<string, string> = { error: "text-danger", warn: "text-warning", debug: "text-muted" };

function Logs() {
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => subscribeLogs(rerender), []);
    const entries = getLogEntries().slice().reverse();

    return (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 38 }}>
            <Stack spacing={8}>
                {entries.length === 0 && <Text variant="text-md/medium" color="text-muted">Nothing logged yet.</Text>}
                {entries.map((entry, i) => (
                    <Text key={i} variant="text-xs/medium" color={LEVEL_COLORS[entry.level] ?? "text-normal"} style={{ fontFamily: "Menlo" }}>
                        {new Date(entry.time).toLocaleTimeString()} [{entry.tag}] {entry.message}
                    </Text>
                ))}
            </Stack>
        </ScrollView>
    );
}

export default function Developer() {
    useProxy(loaderConfig);
    const navigation = NavigationNative.useNavigation();

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Bundle">
                    <TableSwitchRow
                        label="Load from custom URL"
                        subLabel={`Currently running the ${loader.bundle.source} bundle (${loader.bundle.version}). Falls back to the embedded bundle if the URL can't be reached.`}
                        icon={<Icon name="LinkIcon" />}
                        value={loaderConfig.customLoadUrl.enabled}
                        onValueChange={(enabled: boolean) => void (loaderConfig.customLoadUrl = { ...loaderConfig.customLoadUrl, enabled })}
                    />
                    {loaderConfig.customLoadUrl.enabled && (
                        <TableRow label={
                            <TextInput
                                defaultValue={loaderConfig.customLoadUrl.url}
                                size="md"
                                placeholder="http://192.168.1.2:4040/discordia.js"
                                label="Bundle URL"
                                onChange={(url: string) => void (loaderConfig.customLoadUrl = { ...loaderConfig.customLoadUrl, url })}
                            />
                        } />
                    )}
                    <TableRow label="Reload Discord" icon={<Icon name="RetryIcon" />} onPress={() => setTimeout(reloadApp, 300)} />
                </TableRowGroup>

                <TableRowGroup title="Debugging">
                    <TableRow label="Logs" icon={<Icon name="FileIcon" />} arrow onPress={() => openPage("Logs", Logs, navigation)} />
                    <TableRow
                        label="Tweak logs"
                        subLabel="Native and JS log for this and the previous launch. Also opens with a three-finger long press."
                        icon={<Icon name="FileIcon" />}
                        onPress={() => callNative("diag.showLogs").catch(e => Alert.alert("Unavailable", String(e)))}
                    />
                    <TableSwitchRow
                        label="Startup banner"
                        subLabel="Briefly shows whether Discordia started, after each launch."
                        icon={<Icon name="CircleInformationIcon" />}
                        value={loaderConfig.showStartupBanner ?? true}
                        onValueChange={(value: boolean) => void (loaderConfig.showStartupBanner = value)}
                    />
                    <TableRow
                        label="Copy loader info"
                        subLabel="The payload the native tweak passed to this launch."
                        icon={<Icon name="CopyIcon" />}
                        onPress={() => {
                            clipboard.setString(JSON.stringify(loader, null, 2));
                            showToast("Copied", findAssetId("CopyIcon"));
                        }}
                    />
                    <TableRow
                        label="Clear module cache"
                        subLabel="Forces a full module scan on the next launch."
                        icon={<Icon name="TrashIcon" />}
                        onPress={async () => {
                            await clearMetroCache();
                            showToast("Module cache cleared", findAssetId("CheckmarkLargeIcon"));
                        }}
                    />
                    <TableRow
                        label="Test error boundary"
                        icon={<Icon name="BugIcon" />}
                        onPress={() => openPage("Crash test", () => {
                            throw new Error("This is a test error from the Developer page");
                        }, navigation)}
                    />
                    <TableRow
                        label="Evaluate JavaScript"
                        icon={<Icon name="PencilIcon" />}
                        onPress={() => Alert.prompt("Evaluate", "Runs in Discord's global scope.", async (code?: string) => {
                            if (!code) return;
                            try {
                                // eslint-disable-next-line no-eval
                                const result = await (0, eval)(code);
                                Alert.alert("Result", String(result));
                            } catch (e) {
                                Alert.alert("Error", String(e));
                            }
                        })}
                    />
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}
