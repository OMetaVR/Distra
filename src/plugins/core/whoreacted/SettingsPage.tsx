import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";

import { nativeStatus, settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

async function editNumber(title: string, current: number, min: number, max: number, apply: (value: number) => void) {
    const value = await prompt({ title, message: `${min} to ${max}`, defaultValue: String(current), confirmText: "Save" });
    const number = Math.floor(Number(value));
    if (value !== null && Number.isFinite(number)) apply(Math.min(max, Math.max(min, number)));
}

export default function SettingsPage() {
    useProxy(settings);
    const avatars = nativeStatus.installed;
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                {nativeStatus.checked && !avatars && (
                    <Text variant="text-sm/medium" color="text-feedback-warning">
                        This version of the Distra tweak can't draw avatars in reaction pills. Update the tweak, or turn on the
                        names line below.
                    </Text>
                )}

                <TableRowGroup title="Avatars">
                    <TableRow
                        label="Avatars per reaction"
                        subLabel="Shown inside the pill, after the count"
                        icon={<Icon name="FriendsIcon" />}
                        trailing={<TableRowTrailingText text={String(settings.maxAvatars)} />}
                        disabled={!avatars}
                        onPress={() => editNumber("Avatars per reaction", settings.maxAvatars, 1, 8, v => settings.maxAvatars = v)}
                    />
                    <TableRow
                        label="Skip messages with more than"
                        subLabel="Distinct reactions; busy messages stay as they are"
                        icon={<Icon name="ReactionIcon" />}
                        trailing={<TableRowTrailingText text={`${settings.maxReactions} reactions`} />}
                        onPress={() => editNumber("Skip messages with more reactions than", settings.maxReactions, 1, 20, v => settings.maxReactions = v)}
                    />
                    <TableSwitchRow
                        label="Fetch reactors"
                        subLabel="Ask Discord who reacted when it hasn't loaded them yet (one request at a time, once per reaction). Off: only reactors Discord already knows, such as you and anyone seen in the reactions sheet."
                        icon={<Icon name="DownloadIcon" />}
                        value={settings.fetchReactors}
                        onValueChange={(value: boolean) => void (settings.fetchReactors = value)}
                    />
                </TableRowGroup>

                <TableRowGroup title="Names line">
                    <TableSwitchRow
                        label="Show names under messages"
                        subLabel={"Adds a line like \"🗿 Alice, Bob +3\" at the end of the message. Tap the names to open the full list."}
                        icon={<Icon name="TextIcon" />}
                        value={settings.namesLine}
                        onValueChange={(value: boolean) => void (settings.namesLine = value)}
                    />
                    {settings.namesLine && (
                        <TableRow
                            label="Names per reaction"
                            subLabel="The rest show as +N"
                            icon={<Icon name="UserIcon" />}
                            trailing={<TableRowTrailingText text={String(settings.maxNames)} />}
                            onPress={() => editNumber("Names per reaction", settings.maxNames, 1, 10, v => settings.maxNames = v)}
                        />
                    )}
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Changes apply as messages redraw.
                </Text>
            </Stack>
        </ScrollView>
    );
}
