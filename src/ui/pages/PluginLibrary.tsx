// Built-in plugins (vendored in builtin-plugins/, shipped inside the tweak) plus
// recommended plugins that are installed from their authors instead.

import { useState } from "react";
import { Alert, ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { errorToString } from "@/lib/utils";
import { NavigationNative } from "@/metro/common";
import { builtins, flavors, installPlugin, normalizeUrl, plugins } from "@/plugins/manager";
import type { PluginRecord } from "@/plugins/types";
import { Stack, TableRow, TableRowGroup, Text, TextInput } from "@/ui/components";
import { openPage } from "@/ui/settings";
import { showToast } from "@/ui/toasts";

import recommended from "../../../builtin-plugins/recommended.json";
import { authorsOf, PluginDetails } from "./Plugins";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

type Filter = "all" | "enabled" | "vendetta" | "enmity";
const FILTERS: Record<Filter, string> = {
    all: "All plugins",
    enabled: "Enabled",
    vendetta: "Vendetta / Bunny / Revenge",
    enmity: "Enmity (legacy)",
};

function chooseFilter(current: Filter, onChange: (filter: Filter) => void) {
    Alert.alert("Show", undefined, [
        ...(Object.keys(FILTERS) as Filter[]).map(filter => ({
            text: `${FILTERS[filter]}${filter === current ? " ✓" : ""}`,
            onPress: () => onChange(filter),
        })),
        { text: "Cancel", style: "cancel" as const },
    ]);
}

const matches = (record: PluginRecord, query: string, filter: Filter) => {
    if (filter === "enabled" && !record.enabled) return false;
    if (filter === "vendetta" && record.flavor !== "vendetta") return false;
    if (filter === "enmity" && record.flavor !== "enmity") return false;
    if (!query) return true;
    const haystack = `${record.manifest.name} ${record.manifest.description ?? ""} ${authorsOf(record) ?? ""}`.toLowerCase();
    return query.toLowerCase().split(/\s+/).every(word => haystack.includes(word));
};

function statusLabel(record: PluginRecord) {
    if (record.error) return "Failed to start";
    if (record.enabled) return "Enabled";
    if (record.builtin?.status === "warning") return "Has known issues";
    return null;
}

export default function PluginLibrary() {
    useProxy(builtins);
    useProxy(plugins);
    const navigation = NavigationNative.useNavigation();
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");

    const list = Object.values(builtins)
        .filter(record => matches(record, query, filter))
        .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

    const installed = new Set(Object.keys(plugins));
    const extras = recommended.plugins.filter(plugin =>
        filter !== "enmity" && filter !== "enabled"
        && (!query || `${plugin.name} ${plugin.description} ${plugin.authors.join(" ")}`.toLowerCase().includes(query.toLowerCase())));

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }} keyboardShouldPersistTaps="handled">
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <Stack spacing={12}>
                    <TextInput placeholder="Search plugins" size="md" isClearable defaultValue={query} onChange={(value: string) => setQuery(value)} />
                    <TableRowGroup>
                        <TableRow
                            label={`Showing: ${FILTERS[filter]}`}
                            subLabel={`${list.length} of ${Object.keys(builtins).length}`}
                            icon={<Icon name="ChannelListMagnifyingGlassIcon" />}
                            onPress={() => chooseFilter(filter, setFilter)}
                        />
                    </TableRowGroup>
                </Stack>

                <TableRowGroup title="Included with Distra">
                    {list.length === 0 ? (
                        <TableRow label="No matching plugins" icon={<Icon name="PuzzlePieceIcon" />} />
                    ) : list.map(record => (
                        <TableRow
                            key={record.id}
                            label={record.manifest.name}
                            subLabel={[
                                statusLabel(record),
                                record.manifest.description,
                                [flavors[record.flavor].label, authorsOf(record)].filter(Boolean).join(" · "),
                            ].filter(Boolean).join("\n")}
                            icon={<Icon name={record.error ? "ic_warning_24px" : record.enabled ? "CheckmarkLargeIcon" : "PuzzlePieceIcon"} />}
                            arrow
                            onPress={() => openPage(record.manifest.name, () => <PluginDetails id={record.id} />, navigation)}
                        />
                    ))}
                </TableRowGroup>

                {extras.length > 0 && (
                    <TableRowGroup title="More plugins (installed from their authors)">
                        {extras.map(plugin => {
                            const isInstalled = installed.has(normalizeUrl(plugin.installUrl));
                            return (
                                <TableRow
                                    key={plugin.installUrl}
                                    label={plugin.name}
                                    subLabel={[plugin.description, `by ${plugin.authors.join(", ")}`, plugin.warning].filter(Boolean).join("\n")}
                                    icon={<Icon name={isInstalled ? "CheckmarkLargeIcon" : "DownloadIcon"} />}
                                    disabled={isInstalled}
                                    onPress={async () => {
                                        try {
                                            const record = await installPlugin(plugin.installUrl, "vendetta");
                                            showToast(`Installed ${record.manifest.name}`, findAssetId("CheckmarkLargeIcon"));
                                        } catch (e) {
                                            Alert.alert("Install failed", errorToString(e));
                                        }
                                    }}
                                />
                            );
                        })}
                    </TableRowGroup>
                )}

                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Built-in plugins are written by their respective authors and shipped under their own licenses.
                    Enable only what you need; every plugin runs with full access to your account.
                </Text>
            </Stack>
        </ScrollView>
    );
}
