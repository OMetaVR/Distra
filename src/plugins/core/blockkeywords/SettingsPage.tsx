import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { confirm, prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableSwitchRow, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { compile, isInvalid } from "./matcher";
import { type BlockKeywordsSettings, settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

function validRegex(value: string) {
    try {
        new RegExp(value);
        return true;
    } catch {
        return false;
    }
}

async function addKeywords() {
    const value = await prompt({
        title: "Block keywords",
        message: settings.useRegex ? "One regular expression" : "Separate several with commas",
        confirmText: "Add",
    });
    if (!value?.trim()) return;
    const entries = settings.useRegex ? [value.trim()] : value.split(",").map(part => part.trim()).filter(Boolean);
    if (settings.useRegex && !validRegex(entries[0])) return showToast("That isn't a valid regular expression", findAssetId("CircleXIcon"));
    const fresh = entries.filter(entry => !settings.keywords.includes(entry));
    if (fresh.length) settings.keywords.push(...fresh);
}

async function editKeyword(index: number) {
    const current = settings.keywords[index];
    const value = await prompt({ title: "Edit keyword", defaultValue: current, confirmText: "Save" });
    if (value === null) return;
    if (!value.trim()) return void settings.keywords.splice(index, 1);
    if (settings.useRegex && !validRegex(value.trim())) return showToast("That isn't a valid regular expression", findAssetId("CircleXIcon"));
    settings.keywords[index] = value.trim();
}

export default function SettingsPage() {
    useProxy(settings);
    compile();

    const Switch = ({ label, subLabel, field, icon }: { label: string; subLabel?: string; field: keyof BlockKeywordsSettings; icon: string }) => (
        <TableSwitchRow
            label={label}
            subLabel={subLabel}
            icon={<Icon name={icon} />}
            value={settings[field] as boolean}
            onValueChange={(value: boolean) => void ((settings as any)[field] = value)}
        />
    );

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title={`Keywords (${settings.keywords.length})`}>
                    {settings.keywords.map((keyword, index) => (
                        <TableRow
                            key={`${index}:${keyword}`}
                            label={keyword}
                            subLabel={isInvalid(keyword) ? "Not a valid regular expression: ignored" : undefined}
                            icon={<Icon name={isInvalid(keyword) ? "WarningIcon" : "ChatXIcon"} />}
                            arrow
                            onPress={() => editKeyword(index)}
                        />
                    ))}
                    <TableRow label="Add keywords" icon={<Icon name="PlusSmallIcon" />} onPress={addKeywords} />
                    {settings.keywords.length ? (
                        <TableRow
                            label="Remove all"
                            icon={<Icon name="TrashIcon" />}
                            variant="danger"
                            onPress={async () => {
                                if (await confirm({ title: "Remove every keyword?", confirmText: "Remove", destructive: true })) settings.keywords.splice(0);
                            }}
                        />
                    ) : null}
                </TableRowGroup>

                <TableRowGroup title="Matching">
                    <Switch label="Regular expressions" subLabel="Each keyword is a regular expression (advanced)" field="useRegex" icon="SlashBoxIcon" />
                    <Switch label="Case sensitive" field="caseSensitive" icon="TextIcon" />
                    <Switch label="Whole words only" subLabel="Plain keywords don't match inside longer words" field="wholeWords" icon="ChatIcon" />
                    <Switch label="Check embeds" subLabel="Link previews and bot embeds (titles, descriptions, fields)" field="checkEmbeds" icon="ImageIcon" />
                </TableRowGroup>

                <TableRowGroup title="Options">
                    <Switch label="Ignore my own messages" field="ignoreOwnMessages" icon="UserIcon" />
                    <Switch
                        label="Ignore new matching messages"
                        subLabel="They don't show up live or mark the channel unread; they appear collapsed once the channel reloads"
                        field="ignoreNewMessages"
                        icon="BellSlashIcon"
                    />
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Matching messages collapse into Discord's "blocked messages" row; tap it to show them. Only this
                    device is affected. Tap a keyword to edit it; clear its text to remove it.
                </Text>
            </Stack>
        </ScrollView>
    );
}
