// Voice Stats data: what Discord 348 exposes about the current voice connection.
// - RTCConnectionStore: state, ping history, quality, outbound loss, hostname, session, DAVE state.
// - MEDIA_ENGINE_CONNECTION_STATS: the native engine's periodic stats ({ transport, rtp: { inbound:
//   { [userId]: [...] }, outbound: [...] } }) per connection, dispatched by MediaEngineStore.
//   When none arrive (the sheet is open but polling is idle) the connections are asked directly.
// - The transport encryption mode, captured when Discord hands it to the media connection.
// Everything is read defensively: outside a call it all comes back empty.

import { Logger } from "@/lib/logger";
import type { Patcher } from "@/lib/patcher";
import { findByFilePath, findByStoreName } from "@/metro";
import { FluxDispatcher } from "@/metro/common";

const CONNECTION = "../discord_common/js/packages/media-engine/native/Connection.tsx";
const logger = new Logger("VoiceStats");

export interface Sample {
    at: number;
    stats: any;
}

/** Latest two stats samples per media connection context ("default" voice, "stream"). */
const samples = new Map<string, { last?: Sample; previous?: Sample }>();
let encryptionMode: string | undefined;
let subscribed = false;

const RTC = () => findByStoreName("RTCConnectionStore");

function record(context: string, stats: any) {
    if (!stats || typeof stats !== "object") return;
    const entry = samples.get(context) ?? {};
    entry.previous = entry.last;
    entry.last = { at: Date.now(), stats };
    samples.set(context, entry);
}

function onConnectionStats(event: any) {
    const list = event?.connectionStats;
    if (!Array.isArray(list)) return;
    for (const item of list) record(typeof item?.context === "string" ? item.context : "default", item?.stats);
}

export function startCollecting(patcher: Patcher) {
    if (!subscribed && FluxDispatcher?.subscribe) {
        FluxDispatcher.subscribe("MEDIA_ENGINE_CONNECTION_STATS", onConnectionStats);
        subscribed = true;
        patcher.addCleanup(() => {
            FluxDispatcher.unsubscribe?.("MEDIA_ENGINE_CONNECTION_STATS", onConnectionStats);
            subscribed = false;
        });
    }
    const Connection = findByFilePath(CONNECTION)?.default;
    if (typeof Connection?.prototype?.setEncryption === "function") {
        // (mode, secretKey): only the mode is kept.
        patcher.before("setEncryption", Connection.prototype, function (this: any, [mode]: any[]) {
            if (typeof mode === "string" && (this?.context ?? "default") === "default") encryptionMode = mode;
        });
    } else logger.warn("Media engine Connection.setEncryption not found");
    patcher.addCleanup(() => {
        samples.clear();
        encryptionMode = undefined;
    });
}

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
    Promise.race([promise, new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms))]);

let polling = false;
/** Asks every media connection for stats when the dispatched ones are older than `maxAge`. */
export function pollIfStale(maxAge = 2500) {
    const last = samples.get("default")?.last;
    if (polling || (last && Date.now() - last.at < maxAge) || !isConnected()) return;
    const engine = findByStoreName("MediaEngineStore")?.getMediaEngine?.();
    if (typeof engine?.eachConnection !== "function") return;
    polling = true;
    const pending: Promise<unknown>[] = [];
    try {
        engine.eachConnection((connection: any) => {
            if (typeof connection?.getStats !== "function") return;
            const context = typeof connection.context === "string" ? connection.context : "default";
            pending.push(withTimeout(Promise.resolve(connection.getStats()), 3000)
                .then(stats => record(context, stats))
                .catch(() => undefined));
        });
    } catch (e) {
        logger.warn("Polling stats failed", e);
    }
    Promise.all(pending).finally(() => void (polling = false));
}

export function isConnected(): boolean {
    try {
        return !!RTC()?.isConnected?.();
    } catch {
        return false;
    }
}

const call = <T>(target: any, method: string, ...args: any[]): T | undefined => {
    try {
        return typeof target?.[method] === "function" ? target[method](...args) : undefined;
    } catch {
        return undefined;
    }
};

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const first = (...values: unknown[]) => values.find(value => value != null && value !== "");

/** Bits per second from two byte counters `seconds` apart. */
function rate(current: unknown, previous: unknown, seconds: number) {
    const a = num(current), b = num(previous);
    if (a == null || b == null || seconds <= 0 || a < b) return undefined;
    return (a - b) * 8 / seconds;
}

export interface StreamStats {
    codec?: string;
    bitrate?: number;
    packets?: number;
    packetsLost?: number;
    lossPercent?: number;
    jitter?: number;
    audioLevel?: number;
}

export interface UserStats extends StreamStats {
    userId: string;
    name: string;
    volume?: number;
    muted?: boolean;
    speaking?: boolean;
}

export interface VoiceSnapshot {
    connected: boolean;
    state?: string;
    channelName?: string;
    guildName?: string;
    hostname?: string;
    region?: string;
    rtcRegion?: string;
    averagePing?: number;
    lastPing?: number;
    pings: number[];
    quality?: string;
    outboundLossRate?: number;
    duration?: number;
    mediaSessionId?: string;
    encryptionMode?: string;
    e2ee?: string;
    availableOutgoingBitrate?: number;
    transport: Record<string, string | number | boolean>;
    outbound?: StreamStats;
    users: UserStats[];
    statsAge?: number;
}

const audioOf = (entries: unknown) => Array.isArray(entries) ? entries.find(entry => entry?.type === "audio") ?? entries[0] : undefined;

function streamStats(entry: any, previousEntry: any, seconds: number, direction: "in" | "out"): StreamStats | undefined {
    if (!entry || typeof entry !== "object") return undefined;
    const packets = num(direction === "in" ? entry.packetsReceived : entry.packetsSent);
    const packetsLost = num(entry.packetsLost);
    const fraction = num(entry.fractionLost);
    const lossPercent = fraction != null
        ? (fraction > 1 ? fraction / 2.56 : fraction * 100)
        : packets != null && packetsLost != null && packets + packetsLost > 0 ? packetsLost * 100 / (packets + packetsLost) : undefined;
    const bytesKey = direction === "in" ? "bytesReceived" : "bytesSent";
    return {
        codec: first(entry.codec?.name, typeof entry.codec === "string" ? entry.codec : undefined) as string | undefined,
        bitrate: num(entry.bitrate) ?? rate(entry[bytesKey], previousEntry?.[bytesKey], seconds),
        packets,
        packetsLost,
        lossPercent,
        jitter: num(first(entry.jitter, entry.jitterBuffer)),
        audioLevel: num(entry.audioLevel),
    };
}

/** "c-fra11-1a2b3c4d.discord.media" -> "fra". */
function regionFromHostname(hostname: string | undefined) {
    const match = hostname?.match(/^(?:c-)?([a-z]+)\d*-/i) ?? hostname?.match(/^([a-z-]+?)\d+\./i);
    return match?.[1]?.toLowerCase();
}

function describeSecureFrames(state: any): string | undefined {
    if (state == null) return undefined;
    if (typeof state !== "object") return String(state);
    const version = num(first(state.protocolVersion, state.version, state.daveProtocolVersion));
    const label = first(state.state, state.status);
    if (version != null) return version > 0 ? `DAVE v${version}${label ? ` (${label})` : ""}` : "Off";
    return typeof label === "string" ? label : undefined;
}

function primitiveEntries(object: any) {
    const out: Record<string, string | number | boolean> = {};
    if (!object || typeof object !== "object") return out;
    for (const [key, value] of Object.entries(object)) {
        if (/key|secret|token|address/i.test(key)) continue; // never show keys or IPs
        if (typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && value.length < 80)) out[key] = value;
    }
    return out;
}

export function getSnapshot(includeUsers = true): VoiceSnapshot {
    const rtc = RTC();
    const connected = isConnected();
    const empty: VoiceSnapshot = { connected: false, pings: [], transport: {}, users: [] };
    if (!rtc || !connected) return { ...empty, state: call<string>(rtc, "getState") };

    const channelId = call<string>(rtc, "getChannelId");
    const channel = channelId ? call<any>(findByStoreName("ChannelStore"), "getChannel", channelId) : undefined;
    const guildId = call<string>(rtc, "getGuildId") ?? channel?.guild_id;
    const guild = guildId ? call<any>(findByStoreName("GuildStore"), "getGuild", guildId) : undefined;
    const hostname = call<string>(rtc, "getHostname") || undefined;
    const pings = (call<any[]>(rtc, "getPings") ?? [])
        .map(ping => num(typeof ping === "object" ? ping?.value : ping))
        .filter((ping): ping is number => ping != null);

    const sample = samples.get("default");
    const stats = sample?.last?.stats;
    const previous = sample?.previous?.stats;
    const seconds = sample?.last && sample.previous ? (sample.last.at - sample.previous.at) / 1000 : 0;

    const rtcConnection = call<any>(rtc, "getRTCConnection");
    const snapshot: VoiceSnapshot = {
        connected: true,
        state: call<string>(rtc, "getState"),
        channelName: channel?.name || undefined,
        guildName: guild?.name,
        hostname,
        region: regionFromHostname(hostname),
        rtcRegion: channel ? channel.rtcRegion ?? "Automatic" : undefined,
        averagePing: num(call(rtc, "getAveragePing")),
        lastPing: num(call(rtc, "getLastPing")),
        pings,
        quality: call<string>(rtc, "getQuality"),
        outboundLossRate: num(call(rtc, "getOutboundLossRate")),
        duration: num(call(rtc, "getDuration")),
        mediaSessionId: call<string>(rtc, "getMediaSessionId") ?? undefined,
        encryptionMode: (typeof rtcConnection?._encryptionMode === "string" ? rtcConnection._encryptionMode : undefined) ?? encryptionMode,
        e2ee: describeSecureFrames(call(rtc, "getSecureFramesState")),
        availableOutgoingBitrate: num(stats?.transport?.availableOutgoingBitrate),
        transport: primitiveEntries(stats?.transport),
        outbound: streamStats(audioOf(stats?.rtp?.outbound), audioOf(previous?.rtp?.outbound), seconds, "out"),
        users: [],
        statsAge: sample?.last ? Date.now() - sample.last.at : undefined,
    };

    if (includeUsers) {
        const inbound = stats?.rtp?.inbound && typeof stats.rtp.inbound === "object" ? stats.rtp.inbound : {};
        const ids = new Set<string>([...(call<string[]>(rtc, "getUserIds") ?? []), ...Object.keys(inbound)]);
        const UserStore = findByStoreName("UserStore");
        const MediaEngineStore = findByStoreName("MediaEngineStore");
        const SpeakingStore = findByStoreName("SpeakingStore");
        const me = call<any>(UserStore, "getCurrentUser")?.id;
        for (const userId of ids) {
            if (!userId || userId === me) continue;
            const user = call<any>(UserStore, "getUser", userId);
            snapshot.users.push({
                userId,
                name: user?.globalName ?? user?.global_name ?? user?.username ?? userId,
                volume: num(call(MediaEngineStore, "getLocalVolume", userId)),
                muted: call<boolean>(MediaEngineStore, "isLocalMute", userId),
                speaking: call<boolean>(SpeakingStore, "isSpeaking", userId),
                ...streamStats(audioOf(inbound[userId]), audioOf(previous?.rtp?.inbound?.[userId]), seconds, "in"),
            });
        }
        snapshot.users.sort((a, b) => a.name.localeCompare(b.name));
    }
    return snapshot;
}

export const format = {
    ms: (value?: number) => value == null ? "—" : `${Math.round(value)} ms`,
    percent: (value?: number, digits = 1) => value == null ? "—" : `${value.toFixed(digits)}%`,
    bitrate: (value?: number) => value == null ? "—" : value >= 1e6 ? `${(value / 1e6).toFixed(2)} Mbps` : `${Math.round(value / 1000)} kbps`,
    count: (value?: number) => value == null ? "—" : value.toLocaleString(),
    duration(value?: number) {
        if (value == null) return "—";
        // RTCConnectionStore reports milliseconds.
        const total = Math.floor(value / 1000);
        const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
        return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
    },
};
