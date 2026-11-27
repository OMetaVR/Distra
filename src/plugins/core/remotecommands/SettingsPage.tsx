import { useEffect, useReducer } from "react";
import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { confirm, prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableSwitchRow, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { getState, loadBackend, onStateChange, removeBackend } from "./backends";
import { type Backend, settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

function normalizeUrl(value: string) {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function addBackend() {
    const url = normalizeUrl((await prompt({ title: "Backend address", message: "e.g. http://mesbot.lan", confirmText: "Next" })) ?? "");
    if (!url) return;
    const token = (await prompt({ title: "Token", message: `The token ${url} expects`, confirmText: "Add" }))?.trim();
    if (!token) return;
    const backend: Backend = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, url, token, enabled: true };
    settings.backends.push(backend);
    await loadBackend(settings.backends[settings.backends.length - 1]);
    const state = getState(backend.id);
    if (state?.status === "ready") showToast(`Added ${state.commands.length} commands from ${state.manifest!.name}`, findAssetId("CheckmarkLargeIcon"));
}

function statusLine(backend: Backend) {
    if (!backend.enabled) return "Off";
    const state = getState(backend.id);
    if (!state || state.status === "loading") return "Loading…";
    if (state.status === "error") return state.error ?? "Couldn't load";
    const count = `${state.commands.length} command${state.commands.length === 1 ? "" : "s"}`;
    return state.skipped.length ? `${count} · skipped, names already taken: ${state.skipped.map(name => `/${name}`).join(", ")}` : count;
}

/** The backend's commands under the headers they get in the slash picker. */
function sectionsOf(backend: Backend) {
    const sections = new Map<string, string[]>();
    for (const command of getState(backend.id)?.commands ?? []) {
        const list = sections.get(command.section) ?? [];
        list.push(`/${command.name}`);
        sections.set(command.section, list);
    }
    return [...sections];
}

function BackendGroup({ backend }: { backend: Backend }) {
    const state = getState(backend.id);
    const title = state?.manifest?.name ?? backend.url;
    return (
        <TableRowGroup title={title}>
            <TableSwitchRow
                label={backend.url}
                subLabel={statusLine(backend)}
                icon={<Icon name={state?.status === "error" ? "WarningIcon" : "SlashBoxIcon"} />}
                value={backend.enabled}
                onValueChange={(value: boolean) => {
                    backend.enabled = value;
                    void loadBackend(backend);
                }}
            />
            {backend.enabled
                ? sectionsOf(backend).map(([section, names]) => (
                    <TableRow key={section} label={section} subLabel={names.join("  ")} icon={<Icon name="ListBulletsIcon" />} />
                ))
                : null}
            <TableRow label="Reload commands" icon={<Icon name="RefreshIcon" />} disabled={!backend.enabled} onPress={() => void loadBackend(backend)} />
            <TableRow
                label="Change token"
                icon={<Icon name="KeyIcon" />}
                onPress={async () => {
                    const token = (await prompt({ title: "Token", defaultValue: backend.token, confirmText: "Save" }))?.trim();
                    if (!token) return;
                    backend.token = token;
                    void loadBackend(backend);
                }}
            />
            <TableRow
                label="Remove"
                icon={<Icon name="TrashIcon" />}
                variant="danger"
                onPress={async () => {
                    if (await confirm({ title: `Remove ${title}?`, message: "Its commands disappear from the slash picker.", confirmText: "Remove", destructive: true })) removeBackend(backend.id);
                }}
            />
        </TableRowGroup>
    );
}

export default function SettingsPage() {
    useProxy(settings);
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => onStateChange(rerender), []);

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                {settings.backends.map(backend => <BackendGroup key={backend.id} backend={backend} />)}

                <TableRowGroup>
                    <TableRow label="Add backend" icon={<Icon name="PlusSmallIcon" />} onPress={addBackend} />
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    A backend is a server you run that describes slash commands and runs them; this plugin only shows
                    them and passes your input along. Backends see the options you enter and the channel you use
                    them in, so only add ones you trust.
                </Text>
            </Stack>
        </ScrollView>
    );
}
