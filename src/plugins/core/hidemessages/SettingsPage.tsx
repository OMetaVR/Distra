import { useEffect, useReducer } from "react";
import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { redrawMessageList } from "@/lib/rowRedraw";
import { findByStoreName } from "@/metro";
import { confirm } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { showMessage } from "./actions";
import { clearHidden, hiddenMessages, onHiddenChanged, setRemember, settings } from "./store";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

const ChannelStore = findByStoreName("ChannelStore");
const UserStore = findByStoreName("UserStore");
const MessageStore = findByStoreName("MessageStore");

const DISCORD_EPOCH = 1420070400000;
const sentAt = (id: string) => new Date(Math.floor(Number(id) / 4194304) + DISCORD_EPOCH);
const newerFirst = (a: string, b: string) => b.length - a.length || (b > a ? 1 : b < a ? -1 : 0);

function channelName(channelId: string) {
    const channel = ChannelStore?.getChannel?.(channelId);
    if (!channel) return "Unknown channel";
    if (channel.name) return `#${channel.name}`;
    const users = (channel.recipients ?? []).map((id: string) => UserStore?.getUser?.(id)).filter(Boolean);
    return users.length ? users.map((user: any) => user.globalName ?? user.username).join(", ") : "Direct message";
}

function authorOf(channelId: string, id: string) {
    const message = MessageStore?.getMessage?.(channelId, id) ?? MessageStore?.getMessages?.(channelId)?.get?.(id);
    return message?.author ? message.author.globalName ?? message.author.username : undefined;
}

const LIST_LIMIT = 50;

export default function SettingsPage() {
    useProxy(settings);
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => onHiddenChanged(rerender), []);
    const list = hiddenMessages();
    const newest = [...list].sort((a, b) => newerFirst(a.id, b.id)).slice(0, LIST_LIMIT);

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Hidden messages">
                    <TableSwitchRow
                        label="Remember hidden messages"
                        subLabel={settings.remember ? "Kept on this device, per account, across restarts" : "Hidden until the app restarts"}
                        icon={<Icon name="DownloadIcon" />}
                        value={settings.remember}
                        onValueChange={(value: boolean) => setRemember(value)}
                    />
                    <TableRow
                        label={settings.remember ? "Stored" : "Hidden this session"}
                        icon={<Icon name="EyeSlashIcon" />}
                        trailing={<TableRowTrailingText text={`${list.length} message${list.length === 1 ? "" : "s"}`} />}
                    />
                    <TableRow
                        label="Clear hidden messages"
                        icon={<Icon name="TrashIcon" />}
                        variant="danger"
                        disabled={!list.length}
                        onPress={async () => {
                            if (!list.length) return;
                            if (!await confirm({ title: "Clear hidden messages?", message: "Every message you hid on this account shows again.", confirmText: "Clear", destructive: true })) return;
                            redrawMessageList(clearHidden());
                            showToast("Hidden messages cleared", findAssetId("CheckmarkLargeIcon"));
                        }}
                    />
                </TableRowGroup>

                {newest.length ? (
                    <TableRowGroup title={list.length > LIST_LIMIT ? `Newest ${LIST_LIMIT}` : "Tap to show again"}>
                        {newest.map(({ id, channelId }) => {
                            const author = authorOf(channelId, id);
                            return (
                                <TableRow
                                    key={id}
                                    label={author ? `${author} in ${channelName(channelId)}` : channelName(channelId)}
                                    subLabel={sentAt(id).toLocaleString()}
                                    icon={<Icon name="EyeIcon" />}
                                    onPress={() => showMessage(id, channelId)}
                                />
                            );
                        })}
                    </TableRowGroup>
                ) : null}

                <Text variant="text-sm/medium" color="text-muted">
                    Hold a message and choose Hide Message. Hidden messages are only hidden on this device: everyone
                    else still sees them. Tap a hidden message, or hold it and choose Show Message, to bring it back.
                </Text>
            </Stack>
        </ScrollView>
    );
}
