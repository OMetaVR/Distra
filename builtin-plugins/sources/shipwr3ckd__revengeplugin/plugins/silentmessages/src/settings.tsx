// Distra: rebuilt with Discord's table rows. The original used the legacy Form rows, whose
// sub-label overlapped the switch's title.
import { React } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { showToast } from "@vendetta/ui/toasts";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableSwitchRow, Stack, TableRow } = findByProps("TableSwitchRow", "TableRowGroup", "Stack", "TableRow");
const { TextInput } = findByProps("TextInput");
const UserStore = findByStoreName("UserStore");
const ChannelStore = findByStoreName("ChannelStore");

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={getAssetIDByName(name)} />;

function isDiscordId(id: string): boolean {
    return /^\d{17,19}$/.test(id);
}

/** A readable name for an id in the list, when Discord has the user or channel cached. */
function describe(id: string) {
    const user = UserStore.getUser?.(id);
    if (user) return user.globalName ?? user.username;
    const channel = ChannelStore.getChannel?.(id);
    if (channel) return channel.name ? `#${channel.name}` : "Direct message";
    return undefined;
}

export default function SilentSettings() {
    useProxy(storage);
    const [input, setInput] = React.useState("");

    storage.silentList ??= [];
    storage.alwaysSilent ??= false;

    const addUserId = () => {
        const clean = input.trim();
        if (!isDiscordId(clean)) return showToast("That isn't a valid ID", getAssetIDByName("CircleXIcon"));
        if (storage.silentList.includes(clean)) return showToast("Already in the list");
        storage.silentList = [...storage.silentList, clean];
        setInput("");
    };

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }} keyboardShouldPersistTaps="handled">
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Sending">
                    <TableSwitchRow
                        label="Always send silently"
                        subLabel="Every message you send won't notify anyone."
                        icon={<Icon name="BellSlashIcon" />}
                        value={!!storage.alwaysSilent}
                        onValueChange={(value: boolean) => (storage.alwaysSilent = value)}
                    />
                </TableRowGroup>

                <Stack spacing={12}>
                    <TextInput
                        placeholder="User or channel ID"
                        size="md"
                        isClearable
                        value={input}
                        keyboardType="numeric"
                        onChange={(value: string) => setInput(value.replace(/[^0-9]/g, ""))}
                        onSubmitEditing={addUserId}
                    />
                    <TableRowGroup>
                        <TableRow
                            label="Add to silent list"
                            subLabel="Messages in these DMs, or mentioning these users, are sent silently."
                            icon={<Icon name="PlusSmallIcon" />}
                            onPress={addUserId}
                        />
                    </TableRowGroup>
                </Stack>

                <TableRowGroup title={`Silent list (${storage.silentList.length})`}>
                    {storage.silentList.length === 0 ? (
                        <TableRow label="Nobody yet" icon={<Icon name="UserIcon" />} />
                    ) : storage.silentList.map((id: string) => (
                        <TableRow
                            key={id}
                            label={describe(id) ?? id}
                            subLabel={describe(id) ? id : undefined}
                            icon={<Icon name="UserIcon" />}
                            trailing={<TableRow.Icon source={getAssetIDByName("TrashIcon")} />}
                            onPress={() => (storage.silentList = storage.silentList.filter((x: string) => x !== id))}
                        />
                    ))}
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}
