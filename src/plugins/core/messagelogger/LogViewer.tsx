import { useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";

import { findAssetId } from "@/lib/assets";
import { clipboard } from "@/metro/common";
import { Stack, TableRow, TableRowGroup, TextInput } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { forgetMessage } from "./capture";
import * as db from "./db";

type Kind = "all" | "deleted" | "edited";
const KINDS: Record<Kind, string> = { all: "Everything", deleted: "Deleted", edited: "Edited" };

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

function when(ms: number) {
    return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function showDetails(message: db.StoredMessage, reload: () => void) {
    const history = await db.editsFor(message.id);
    const lines = [
        ...history.map(edit => `[${when(edit.edited_at)}] ${edit.content}`),
        `${message.deleted_at ? `[deleted ${when(message.deleted_at)}]` : "[current]"} ${message.content}`,
        ...message.attachments.map(a => `📎 ${a.f}`),
    ];
    Alert.alert(message.author.g ?? message.author.u, lines.join("\n\n"), [
        { text: "Copy", onPress: () => (clipboard.setString(lines.join("\n")), showToast("Copied", findAssetId("CopyIcon"))) },
        { text: "Remove from logs", style: "destructive", onPress: () => (forgetMessage(message.channel_id, message.id, true), reload()) },
        { text: "Close", style: "cancel" },
    ]);
}

export default function LogViewer() {
    const [kind, setKind] = useState<Kind>("all");
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState<db.StoredMessage[] | null>(null);

    const reload = () => void db.search({ query, kind }).then(setRows).catch(() => setRows([]));
    useEffect(reload, [kind, query]);

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }} keyboardShouldPersistTaps="handled">
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={16}>
                <TextInput placeholder="Search content or author" size="md" isClearable defaultValue={query} onChange={(value: string) => setQuery(value)} />
                <TableRowGroup>
                    <TableRow
                        label={`Showing: ${KINDS[kind]}`}
                        icon={<Icon name="ChannelListMagnifyingGlassIcon" />}
                        onPress={() => Alert.alert("Show", undefined, [
                            ...(Object.keys(KINDS) as Kind[]).map(k => ({ text: KINDS[k], onPress: () => setKind(k) })),
                            { text: "Cancel", style: "cancel" as const },
                        ])}
                    />
                </TableRowGroup>
                <TableRowGroup title={rows ? `${rows.length} messages` : "Loading…"}>
                    {(rows ?? []).map(message => (
                        <TableRow
                            key={message.id}
                            label={`${message.author.g ?? message.author.u} · ${when(message.deleted_at ?? message.updated_at)}`}
                            subLabel={(message.content || (message.attachments.length ? `📎 ${message.attachments.length} attachment(s)` : "")).slice(0, 200)}
                            icon={<Icon name={message.deleted_at ? "TrashIcon" : "PencilIcon"} />}
                            onPress={() => showDetails(message, reload)}
                        />
                    ))}
                    {rows?.length === 0 && <TableRow label="Nothing logged yet" icon={<Icon name="FileIcon" />} />}
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}
