// Voice Stats: a ping chip in the voice call header (next to the speaker / chat buttons) that
// opens a sheet with the connection's details: ping, quality, packet loss, region and voice
// server, your codec and bitrate, transport and end-to-end encryption, and per-user stats
// (codec, loss, jitter, bitrate, volume). Data comes from RTCConnectionStore and the native
// voice engine's periodic stats (see stats.ts). Outside a call nothing is rendered.

import { cloneElement } from "react";
import { ScrollView } from "react-native";

import { createFileStorage, useProxy } from "@/core/storage";
import { afterComponentRender } from "@/lib/components";
import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath } from "@/metro";
import { Stack, TableRadioGroup, TableRadioRow, TableRow, TableRowGroup, TableSwitchRow, Text } from "@/ui/components";

import { definePlugin } from "../types";
import { getSnapshot, isConnected, startCollecting } from "./stats";
import { openStatsSheet, settingsRef, StatsChip, StatsList, type VoiceStatsSettings } from "./ui";

const VOICE_PANEL_HEADER = "modules/voice_panel/native/header/VoicePanelHeader.tsx";
const HEADER_CHAT_BUTTON = "modules/voice_panel/native/header/VoicePanelHeaderChatButton.tsx";
const HEADER_SPEAKER = "modules/voice_panel/native/header/VoicePanelHeaderSpeaker.tsx";
const CHIP_KEY = "distra-voice-stats-chip";
const logger = new Logger("VoiceStats");

const defaults: VoiceStatsSettings = { showChip: true, chipLoss: false, showUsers: true, refreshMs: 1000 };
let settings: VoiceStatsSettings = { ...defaults };
let patcher = createPatcher("VoiceStats");
let warnedNoAnchor = false;

/**
 * Returns `tree` with the chip added at the start of the children list holding an `isAnchor`
 * element, cloning every element on the way (Discord's React Compiler caches elements, so they
 * can't be mutated in place).
 */
function insertChip(tree: any, isAnchor: (node: any) => boolean, depth = 0): any {
    if (!tree || typeof tree !== "object" || depth > 30) return undefined;
    if (Array.isArray(tree)) {
        let changed = false;
        const next = tree.map(child => {
            const replaced = changed ? undefined : insertChip(child, isAnchor, depth + 1);
            if (replaced !== undefined) changed = true;
            return replaced ?? child;
        });
        return changed ? next : undefined;
    }
    const children = tree.props?.children;
    if (children == null) return undefined;
    if (Array.isArray(children)) {
        if (children.some(child => child?.key === CHIP_KEY)) return undefined;
        // The header's right-hand row (speaker, chat, ...): the chip goes first.
        if (children.some(child => child && typeof child === "object" && isAnchor(child))) {
            return cloneElement(tree, { children: [<StatsChip key={CHIP_KEY} />, ...children] });
        }
    } else if (typeof children === "object" && isAnchor(children)) {
        return cloneElement(tree, { children: [<StatsChip key={CHIP_KEY} />, children] });
    }
    const replaced = insertChip(children, isAnchor, depth + 1);
    return replaced === undefined ? undefined : cloneElement(tree, { children: replaced });
}

function patchHeader() {
    const anchors = [findByFilePath(HEADER_CHAT_BUTTON)?.default, findByFilePath(HEADER_SPEAKER)?.default].filter(Boolean);
    if (!anchors.length) logger.warn("Voice panel header buttons not found");
    const isAnchor = (node: any) => anchors.includes(node?.type);
    const patched = afterComponentRender(patcher, VOICE_PANEL_HEADER, (_props, element) => {
        if (!settings.showChip || !anchors.length) return element;
        const next = insertChip(element, isAnchor);
        if (next === undefined && !warnedNoAnchor) {
            warnedNoAnchor = true;
            logger.warn("Voice panel header: no place for the stats chip");
        }
        return next ?? element;
    });
    if (!patched) logger.warn("Voice panel header not found");
}

function SettingsPage() {
    useProxy(settings);
    const connected = isConnected();
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Call screen">
                    <TableSwitchRow
                        label="Ping chip"
                        subLabel="Shows your ping in the voice call header. Tap it for the full stats."
                        icon={<TableRow.Icon source={findAssetId("ConnectionFineIcon")} />}
                        value={settings.showChip}
                        onValueChange={(value: boolean) => void (settings.showChip = value)}
                    />
                    <TableSwitchRow
                        label="Packet loss on the chip"
                        subLabel="Adds your outbound packet loss next to the ping"
                        icon={<TableRow.Icon source={findAssetId("ArrowSmallUpIcon")} />}
                        value={settings.chipLoss}
                        onValueChange={(value: boolean) => void (settings.chipLoss = value)}
                    />
                    <TableSwitchRow
                        label="Per-user stats"
                        subLabel="Codec, packet loss, jitter and volume for everyone in the call"
                        icon={<TableRow.Icon source={findAssetId("GroupIcon") ?? findAssetId("UserIcon")} />}
                        value={settings.showUsers}
                        onValueChange={(value: boolean) => void (settings.showUsers = value)}
                    />
                </TableRowGroup>
                <TableRadioGroup title="Refresh the stats sheet every" value={String(settings.refreshMs)} onChange={(value: string) => void (settings.refreshMs = Number(value))}>
                    <TableRadioRow label="1 second" value="1000" />
                    <TableRadioRow label="2 seconds" value="2000" />
                    <TableRadioRow label="5 seconds" value="5000" />
                </TableRadioGroup>
                <TableRowGroup title="Now">
                    <TableRow
                        label="Open Voice Stats"
                        subLabel={connected ? undefined : "Join a voice channel or call first"}
                        icon={<TableRow.Icon source={findAssetId("AnalyticsIcon") ?? findAssetId("CircleInformationIcon")} />}
                        arrow
                        disabled={!connected}
                        onPress={connected ? openStatsSheet : undefined}
                    />
                </TableRowGroup>
                {connected ? <StatsList /> : null}
                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Ping is the round trip to Discord's voice server. Per-user numbers come from the voice engine and
                    update every few seconds.
                </Text>
            </Stack>
        </ScrollView>
    );
}

export default definePlugin({
    id: "distra:voice-stats",
    manifest: {
        name: "Voice Stats",
        description: "Shows your voice connection's ping in calls; tap it for packet loss, codec, bitrate, encryption, server region and per-user stats.",
        authors: [{ name: "Distra" }],
        version: "1.0.0",
    },

    async start() {
        settings = await createFileStorage<VoiceStatsSettings>("plugins/data/core-voicestats.json", defaults);
        settingsRef.current = settings;
        patcher = createPatcher("VoiceStats");
        warnedNoAnchor = false;
        startCollecting(patcher);
        patchHeader();
    },

    stop() {
        patcher.unpatchAll();
    },

    SettingsComponent: SettingsPage,

    api: {
        getSnapshot,
        openStatsSheet,
    },
});
