import { useEffect, useReducer } from "react";
import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { url } from "@/metro/common";
import { prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { databaseInfo, databaseSite, loadDatabase, onDatabaseChanged, refreshDatabase } from "./database";
import { DEFAULT_DATABASE, settings, type TimezoneSettings } from "./settings";
import { openZonePicker } from "./sheets";
import { systemZone, timeIn } from "./time";
import { displayName } from "./zonesStore";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

const HOUR_CYCLES: Array<{ value: TimezoneSettings["hourCycle"]; label: string }> = [
    { value: "auto", label: "Automatic" },
    { value: "12", label: "12-hour" },
    { value: "24", label: "24-hour" },
];

type Toggle = "showInProfile" | "showInMessages" | "showOwn" | "showZoneName" | "useDatabase" | "preferDatabase";

const when = (time?: number) => time ? new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

async function addById() {
    const id = await prompt({ title: "Add someone", message: "Their user ID (Developer Mode on: profile, ..., Copy User ID)", confirmText: "Next" });
    const trimmed = id?.trim();
    if (!trimmed) return;
    if (!/^\d{15,21}$/.test(trimmed)) return showToast("That isn't a user ID");
    openZonePicker(trimmed);
}

async function editDatabaseUrl() {
    const value = await prompt({ title: "Database server", message: `Default: ${DEFAULT_DATABASE}`, defaultValue: settings.databaseUrl, confirmText: "Save" });
    if (value === null) return;
    const trimmed = value.trim() || DEFAULT_DATABASE;
    if (!/^https?:\/\//.test(trimmed)) return showToast("That isn't a URL");
    settings.databaseUrl = trimmed;
    void refreshDatabase();
}

export default function SettingsPage() {
    useProxy(settings);
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => onDatabaseChanged(rerender), []);

    const Switch = ({ label, subLabel, field, icon }: { label: string; subLabel?: string; field: Toggle; icon: string }) => (
        <TableSwitchRow label={label} subLabel={subLabel} icon={<Icon name={icon} />} value={settings[field]} onValueChange={(value: boolean) => {
            settings[field] = value;
            if (field === "useDatabase" && value) void loadDatabase();
        }} />
    );

    const device = systemZone();
    const people = Object.entries(settings.zones)
        .map(([userId, zone]) => ({ userId, zone, name: displayName(userId) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const database = databaseInfo();
    const cycle = HOUR_CYCLES.find(entry => entry.value === settings.hourCycle) ?? HOUR_CYCLES[0];

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Show">
                    <Switch label="In profiles" subLabel="A local time line under the name" field="showInProfile" icon="UserIcon" />
                    <Switch label="Next to message timestamps" subLabel="Their time when the message was sent" field="showInMessages" icon="ChatIcon" />
                    <Switch label="Your own time" field="showOwn" icon="UserCircleIcon" />
                    <Switch label="Time zone name" subLabel="EDT, GMT+1, ..." field="showZoneName" icon="GlobeEarthIcon" />
                    <TableRow
                        label="Clock"
                        icon={<Icon name="ClockIcon" />}
                        trailing={<TableRowTrailingText text={cycle.label} />}
                        onPress={() => void (settings.hourCycle = HOUR_CYCLES[(HOUR_CYCLES.indexOf(cycle) + 1) % HOUR_CYCLES.length].value)}
                    />
                </TableRowGroup>

                <TableRowGroup title={`People (${people.length})`}>
                    {people.map(person => (
                        <TableRow
                            key={person.userId}
                            label={person.name}
                            subLabel={`${person.zone} · ${timeIn(person.zone)}`}
                            icon={<Icon name="UserIcon" />}
                            arrow
                            onPress={() => openZonePicker(person.userId)}
                        />
                    ))}
                    <TableRow label="Add by user ID" icon={<Icon name="PlusSmallIcon" />} onPress={addById} />
                </TableRowGroup>

                <TableRowGroup title="Timezone database">
                    <Switch label="Use the timezone database" subLabel="Time zones people saved from Equicord / Vencord's Timezones plugin" field="useDatabase" icon="GlobeEarthIcon" />
                    {settings.useDatabase ? (
                        <>
                            <Switch label="Prefer the database" subLabel="Over time zones you set yourself" field="preferDatabase" icon="ArrowsUpDownIcon" />
                            <TableRow
                                label={database.loading ? "Refreshing…" : "Refresh"}
                                subLabel={`${database.count.toLocaleString()} people · updated ${when(database.fetchedAt)}`}
                                icon={<Icon name="RetryIcon" />}
                                disabled={database.loading}
                                onPress={async () => {
                                    if (!await refreshDatabase()) showToast("Couldn't reach the timezone database");
                                }}
                            />
                            <TableRow label="Server" subLabel={settings.databaseUrl} icon={<Icon name="LinkIcon" />} onPress={editDatabaseUrl} />
                            <TableRow
                                label="Save your time zone there"
                                subLabel="Opens the site (sign in with Discord)"
                                icon={<Icon name="LinkExternalSmallIcon" />}
                                arrow
                                onPress={() => url.openURL(databaseSite())}
                            />
                        </>
                    ) : null}
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Your time zone: {device} ({timeIn(device)}). Set someone's from the "..." menu in their profile, or tap the
                    time in their profile to change it. Message timestamps update when the chat redraws them (reopen the chat).
                </Text>
            </Stack>
        </ScrollView>
    );
}
