import { useEffect, useReducer, useRef, useState } from "react";
import { Alert, ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Stack, TableRow, TableRowGroup, TableSwitchRow, Text, TextInput } from "@/ui/components";

import { format, formatAs } from "./format";
import { CALENDAR_KEYS, FORMAT_KEYS, type FormatKey, FORMATS, formatOf, settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

const SAMPLES: Array<{ label: string; key: FormatKey }> = [
    { label: "Today", key: "sameDay" },
    { label: "Yesterday", key: "lastDay" },
    { label: "Last week", key: "lastWeek" },
    { label: "A month ago", key: "sameElse" },
];

/** Re-renders every second, so previews with seconds or [relative] stay current. */
function useTicker() {
    const [, tick] = useReducer(n => n + 1, 0);
    useEffect(() => {
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, []);
}

function setFormat(key: FormatKey, value: string) {
    const trimmed = value.trim();
    const next = { ...settings.formats };
    if (!trimmed || trimmed === FORMATS[key].default) delete next[key];
    else next[key] = value;
    settings.formats = next;
}

function FormatEditor({ id, sampleDate }: { id: FormatKey; sampleDate: Date }) {
    const info = FORMATS[id];
    const [revision, setRevision] = useState(0);
    const value = formatOf(id);
    // Calendar formats are previewed on their own kind of date; the others on today's.
    const preview = CALENDAR_KEYS.includes(id) ? format(sampleDate, value) : formatAs(sampleDate, id);
    const custom = settings.formats[id] != null;

    const choosePreset = () => Alert.alert(info.name, "Pick a format", [
        ...info.presets.map(preset => ({
            text: `${format(sampleDate, preset)}   (${preset})`,
            onPress: () => {
                setFormat(id, preset);
                setRevision(n => n + 1);
            },
        })),
        { text: "Cancel", style: "cancel" as const },
    ]);

    return (
        <TableRowGroup title={info.name}>
            <TableRow label={preview || " "} subLabel={info.description} icon={<Icon name="ClockIcon" />} />
            <Stack style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <TextInput
                    key={revision}
                    placeholder={info.default}
                    defaultValue={value}
                    onChange={(text: string) => setFormat(id, text)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    isClearable
                />
            </Stack>
            <TableRow label="Presets" icon={<Icon name="ListBulletsIcon" />} arrow onPress={choosePreset} />
            {custom ? (
                <TableRow
                    label="Reset to default"
                    subLabel={info.default}
                    icon={<Icon name="RetryIcon" />}
                    onPress={() => {
                        setFormat(id, info.default);
                        setRevision(n => n + 1);
                    }}
                />
            ) : null}
        </TableRowGroup>
    );
}

export default function SettingsPage() {
    useProxy(settings);
    useTicker();
    // Fixed sample dates (like Equicord's demo messages), so previews don't jump between categories.
    const samples = useRef<Record<FormatKey, Date> | null>(null);
    if (!samples.current) {
        const now = Date.now();
        samples.current = Object.fromEntries(FORMAT_KEYS.map(key => [key, new Date(now + (FORMATS[key].offset ?? 0))])) as Record<FormatKey, Date>;
    }
    const dates = samples.current;

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }} keyboardShouldPersistTaps="handled">
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Preview">
                    {SAMPLES.map(sample => (
                        <TableRow
                            key={sample.key}
                            label={formatAs(dates[sample.key], "header") || " "}
                            subLabel={`${sample.label} · ${formatAs(dates[sample.key], "tooltip")}`}
                            icon={<Icon name="ChatIcon" />}
                        />
                    ))}
                </TableRowGroup>

                {(["header", "tooltip", "accessibility"] as FormatKey[]).map(key => <FormatEditor key={key} id={key} sampleDate={new Date()} />)}

                <Text variant="text-sm/medium" color="text-muted">
                    Calendar formats: what [calendar] turns into, depending on how old the message is.
                </Text>
                {CALENDAR_KEYS.map(key => <FormatEditor key={key} id={key} sampleDate={dates[key]} />)}

                <TableRowGroup title="Messages">
                    <TableSwitchRow
                        label="<t:…> timestamps"
                        subLabel="Use the full date format when tapping timestamps people put in messages"
                        icon={<Icon name="ClockIcon" />}
                        value={settings.markdownTimestamps}
                        onValueChange={(value: boolean) => void (settings.markdownTimestamps = value)}
                    />
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Formats use moment.js tokens: HH:mm:ss (24-hour), h:mm A (12-hour), LT / LTS (your language's time),
                    L / LL / LLL / LLLL (dates), ddd / dddd (weekday), DD.MM.YYYY. Text in [brackets] is shown as is.
                    [calendar] gives Today / Yesterday / ... using the formats above, [relative] gives "4 hours ago".
                    Messages already on screen update when the chat redraws them (reopen the chat).
                </Text>
            </Stack>
        </ScrollView>
    );
}
