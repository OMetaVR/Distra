// Voice Stats UI: the ping chip in the call header, the stats sheet it opens, and the stats
// list (shared by the sheet and the settings page). All of it renders nothing outside a call.

import { useEffect, useReducer } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { findAssetId } from "@/lib/assets";
import { findByProps } from "@/metro";
import { ActionSheet, Stack, TableRow, TableRowGroup, TableRowTrailingText, Text } from "@/ui/components";
import { resolveSemanticColor, semanticColors } from "@/ui/color";

import { format, getSnapshot, pollIfStale, type VoiceSnapshot } from "./stats";

export interface VoiceStatsSettings {
    showChip: boolean;
    chipLoss: boolean;
    showUsers: boolean;
    refreshMs: number;
}

export const settingsRef: { current: VoiceStatsSettings } = {
    current: { showChip: true, chipLoss: false, showUsers: true, refreshMs: 1000 },
};

/** Re-reads the voice connection every `intervalMs` while mounted. */
export function useSnapshot(intervalMs: number, poll: boolean, includeUsers = true): VoiceSnapshot {
    const [, tick] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        if (poll) pollIfStale();
        const timer = setInterval(() => {
            if (poll) pollIfStale();
            tick();
        }, Math.max(500, intervalMs));
        return () => clearInterval(timer);
    }, [intervalMs, poll]);
    return getSnapshot(includeUsers);
}

function qualityColor(snapshot: VoiceSnapshot) {
    const ping = snapshot.lastPing ?? snapshot.averagePing;
    const quality = snapshot.quality;
    const level = quality === "bad" ? 2 : quality === "average" ? 1 : quality === "fine" ? 0
        : ping == null ? -1 : ping < 120 ? 0 : ping < 250 ? 1 : 2;
    const token = [semanticColors.STATUS_POSITIVE, semanticColors.STATUS_WARNING, semanticColors.STATUS_DANGER][level] ?? semanticColors.TEXT_MUTED;
    return resolveSemanticColor(token);
}

const sheets = () => findByProps("openLazy", "hideActionSheet");

export function openStatsSheet() {
    sheets()?.openLazy?.(Promise.resolve({ default: StatsSheet }), "distra-voice-stats", {});
}

/** Small "42 ms" pill for the call header. */
export function StatsChip() {
    const settings = settingsRef.current;
    const snapshot = useSnapshot(2000, false, false);
    if (!settings.showChip || !snapshot.connected) return null;

    const ping = snapshot.lastPing ?? snapshot.averagePing;
    const loss = snapshot.outboundLossRate;
    const label = `${ping ? Math.round(ping) : "—"} ms${settings.chipLoss && loss != null ? ` · ${loss.toFixed(loss >= 10 ? 0 : 1)}%` : ""}`;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Voice connection: ${label}. Show voice stats`}
            hitSlop={8}
            onPress={openStatsSheet}
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                height: 28,
                paddingHorizontal: 10,
                borderRadius: 14,
                marginRight: 8,
                backgroundColor: resolveSemanticColor(semanticColors.CONTROL_OVERLAY_SECONDARY_BACKGROUND_DEFAULT),
            }}
        >
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: qualityColor(snapshot) }} />
            <Text variant="text-xs/semibold" style={{ color: resolveSemanticColor(semanticColors.CONTROL_OVERLAY_SECONDARY_TEXT_DEFAULT) }}>{label}</Text>
        </Pressable>
    );
}

const Icon = ({ name, fallback }: { name: string; fallback?: string }) =>
    <TableRow.Icon source={findAssetId(name) ?? (fallback ? findAssetId(fallback) : undefined)} />;

const Row = ({ label, value, icon, subLabel }: { label: string; value?: string; icon?: string; subLabel?: string }) => (
    <TableRow
        label={label}
        subLabel={subLabel}
        icon={icon ? <Icon name={icon} /> : undefined}
        trailing={value != null ? <TableRowTrailingText text={value} /> : undefined}
    />
);

const titleCase = (value?: string) => value ? value[0].toUpperCase() + value.slice(1) : "—";

/** The full stats list. `poll` asks the engine for stats if Discord isn't dispatching them. */
export function StatsList({ poll = true }: { poll?: boolean }) {
    const settings = settingsRef.current;
    const snapshot = useSnapshot(settings.refreshMs, poll, settings.showUsers);

    if (!snapshot.connected) {
        return (
            <TableRowGroup title="Voice connection">
                <Row label="Not in a voice call" icon="PhoneCallIcon" subLabel={snapshot.state && snapshot.state !== "DISCONNECTED" ? `State: ${snapshot.state}` : "Join a voice channel or call to see its stats."} />
            </TableRowGroup>
        );
    }

    const recentPings = snapshot.pings.slice(-6).map(ping => Math.round(ping)).join("  ");
    const out = snapshot.outbound;
    const transportExtras = Object.entries(snapshot.transport)
        .filter(([key]) => !["availableOutgoingBitrate", "ping"].includes(key))
        .slice(0, 12);

    return (
        <Stack spacing={16}>
            <TableRowGroup title="Connection">
                <Row label="Ping" icon="ConnectionFineIcon" value={format.ms(snapshot.lastPing)} subLabel={recentPings ? `Average ${format.ms(snapshot.averagePing)} · last: ${recentPings}` : `Average ${format.ms(snapshot.averagePing)}`} />
                <Row label="Quality" icon="SpeedometerIcon" value={titleCase(snapshot.quality)} />
                <Row label="Outbound packet loss" icon="ArrowSmallUpIcon" value={format.percent(snapshot.outboundLossRate)} />
                <Row label="Connected for" icon="ClockIcon" value={format.duration(snapshot.duration)} />
                <Row label="State" icon="CircleInformationIcon" value={snapshot.state ?? "—"} />
            </TableRowGroup>

            <TableRowGroup title="Server">
                {snapshot.channelName ? <Row label="Channel" icon="VoiceNormalIcon" value={snapshot.channelName} subLabel={snapshot.guildName} /> : null}
                <Row label="Region" icon="GlobeEarthIcon" value={snapshot.region?.toUpperCase() ?? "—"} subLabel={snapshot.rtcRegion ? `Channel region setting: ${snapshot.rtcRegion}` : undefined} />
                <Row label="Voice server" icon="ServerIcon" value={snapshot.hostname?.replace(/\.discord\.media$/, "") ?? "—"} />
            </TableRowGroup>

            <TableRowGroup title="Your audio">
                <Row label="Codec" icon="MicrophoneIcon" value={out?.codec ?? "—"} />
                <Row label="Bitrate" icon="ArrowSmallUpIcon" value={format.bitrate(out?.bitrate)} subLabel={snapshot.availableOutgoingBitrate != null ? `Available upload: ${format.bitrate(snapshot.availableOutgoingBitrate)}` : undefined} />
                <Row label="Packets sent" icon="AnalyticsIcon" value={format.count(out?.packets)} subLabel={out?.packetsLost != null ? `Reported lost: ${format.count(out.packetsLost)} (${format.percent(out.lossPercent)})` : undefined} />
            </TableRowGroup>

            <TableRowGroup title="Security">
                <Row label="Transport encryption" icon="LockIcon" value={snapshot.encryptionMode ?? "—"} />
                <Row label="End-to-end encryption" icon="ShieldLockIcon" value={snapshot.e2ee ?? "—"} />
            </TableRowGroup>

            {settings.showUsers && snapshot.users.length ? (
                <TableRowGroup title={`Users (${snapshot.users.length})`}>
                    {snapshot.users.map(user => (
                        <Row
                            key={user.userId}
                            label={user.name}
                            icon={user.speaking ? "VoiceNormalIcon" : user.muted ? "VoiceXIcon" : "UserIcon"}
                            value={format.percent(user.lossPercent)}
                            subLabel={[
                                user.codec,
                                user.bitrate != null ? format.bitrate(user.bitrate) : undefined,
                                user.jitter != null ? `jitter ${Math.round(user.jitter)} ms` : undefined,
                                user.volume != null ? `volume ${Math.round(user.volume)}%${user.muted ? " (muted)" : ""}` : undefined,
                            ].filter(Boolean).join(" · ") || "No stats yet"}
                        />
                    ))}
                </TableRowGroup>
            ) : null}

            {transportExtras.length ? (
                <TableRowGroup title="Transport (raw)">
                    {transportExtras.map(([key, value]) => <Row key={key} label={key} value={String(value)} />)}
                </TableRowGroup>
            ) : null}

            <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                {snapshot.statsAge == null ? "Waiting for stats from the voice engine…" : `Engine stats updated ${Math.round(snapshot.statsAge / 1000)}s ago`}
                {snapshot.mediaSessionId ? `\nMedia session ${snapshot.mediaSessionId}` : ""}
            </Text>
        </Stack>
    );
}

export function StatsSheet() {
    return (
        <ActionSheet>
            <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ paddingBottom: 24 }}>
                <Stack spacing={16}>
                    <Text variant="heading-lg/bold" style={{ textAlign: "center" }}>Voice Stats</Text>
                    <StatsList />
                </Stack>
            </ScrollView>
        </ActionSheet>
    );
}
