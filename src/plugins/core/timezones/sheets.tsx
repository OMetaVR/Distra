// The time zone picker (from a profile's "..." menu, its local time line, or the settings page).
// Mobile take on Equicord's SetTimezoneModal: a searchable list instead of a select.

import { useMemo, useState } from "react";
import { ScrollView } from "react-native";

import { findAssetId } from "@/lib/assets";
import { findByProps } from "@/metro";
import { ActionSheet, Stack, TableRow, TableRowGroup, TableRowTrailingText, Text, TextInput } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { databaseZone } from "./database";
import { cityOf, isValidZone, offsetName, systemZone, timeIn } from "./time";
import { ZONES } from "./zones";
import { displayName, setUserZone } from "./zonesStore";
import { settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;
const sheets = () => findByProps("openLazy", "hideActionSheet");
const hide = () => sheets()?.hideActionSheet?.();
const MAX_RESULTS = 60;

function ZoneRow({ zone, selected, onPress }: { zone: string; selected?: boolean; onPress: () => void }) {
    const { city, region } = cityOf(zone);
    const now = new Date();
    return (
        <TableRow
            label={city}
            subLabel={`${region ? `${region} · ` : ""}${offsetName(zone, now)}`}
            trailing={selected ? <Icon name="CheckmarkLargeIcon" /> : <TableRowTrailingText text={timeIn(zone, now, false)} />}
            onPress={onPress}
        />
    );
}

function ZonePicker({ userId }: { userId: string }) {
    const [query, setQuery] = useState("");
    const current = settings.zones[userId];
    const fromDatabase = databaseZone(userId);
    const device = systemZone();

    const pick = (zone: string | null) => {
        setUserZone(userId, zone);
        hide();
    };

    const results = useMemo(() => {
        const needle = query.trim().toLowerCase().replace(/\s+/g, "_");
        const list = needle ? ZONES.filter(zone => zone.toLowerCase().includes(needle)) : ZONES;
        return list.slice(0, MAX_RESULTS);
    }, [query]);
    // A typed zone that isn't in the list (an alias, or a fixed "UTC+5:30" offset).
    const typed = query.trim();
    const custom = typed && !ZONES.some(zone => zone.toLowerCase() === typed.toLowerCase()) && isValidZone(typed) ? typed : null;

    return (
        <ActionSheet>
            <Stack spacing={12} style={{ paddingBottom: 16 }}>
                <Text variant="heading-lg/bold" style={{ textAlign: "center" }}>Time zone</Text>
                <Text variant="text-sm/medium" color="text-muted" style={{ textAlign: "center" }}>{displayName(userId)}</Text>
                <TextInput placeholder="Search (city, region or UTC+5:30)" onChange={(value: string) => setQuery(value)} isClearable autoCapitalize="none" autoCorrect={false} />
                <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
                    <Stack spacing={12}>
                        {!typed ? (
                            <TableRowGroup>
                                {current ? <ZoneRow zone={current} selected onPress={hide} /> : null}
                                {fromDatabase ? (
                                    <TableRow
                                        label="From the timezone database"
                                        subLabel={`${fromDatabase} · ${timeIn(fromDatabase)}`}
                                        icon={<Icon name="GlobeEarthIcon" />}
                                        trailing={!current ? <Icon name="CheckmarkLargeIcon" /> : undefined}
                                        onPress={() => pick(null)}
                                    />
                                ) : null}
                                {current !== device ? (
                                    <TableRow label="Same as yours" subLabel={`${device} · ${timeIn(device)}`} icon={<Icon name="MobilePhoneIcon" />} onPress={() => pick(device)} />
                                ) : null}
                                {current ? (
                                    <TableRow label={fromDatabase ? "Use the database's time zone" : "Remove time zone"} icon={<Icon name="TrashIcon" />} variant="danger" onPress={() => pick(null)} />
                                ) : null}
                            </TableRowGroup>
                        ) : null}
                        <TableRowGroup title={typed ? "Results" : "All time zones"}>
                            {custom ? <ZoneRow zone={custom} onPress={() => pick(custom)} /> : null}
                            {results.map(zone => <ZoneRow key={zone} zone={zone} selected={zone === current} onPress={() => pick(zone)} />)}
                            {!results.length && !custom ? <TableRow label="No matching time zone" /> : null}
                        </TableRowGroup>
                        {results.length >= MAX_RESULTS ? (
                            <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>Search to see more</Text>
                        ) : null}
                    </Stack>
                </ScrollView>
            </Stack>
        </ActionSheet>
    );
}

export function openZonePicker(userId: string) {
    const api = sheets();
    if (!api?.openLazy) return showToast("Couldn't open the time zone picker");
    api.openLazy(Promise.resolve({ default: ZonePicker }), "DistraTimezonePicker", { userId });
}

/** Closes whatever sheet is open (a profile), then opens the picker. */
export function openZonePickerFromSheet(userId: string) {
    hide();
    setTimeout(() => openZonePicker(userId), 350);
}
