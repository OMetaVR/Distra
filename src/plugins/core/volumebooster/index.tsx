// Volume Booster: lets user and stream volume sliders go past Discord's maximum (200%), up to
// 1000%. Port of Vencord's VolumeBooster (Nuckyz, sadan). On mobile the voice engine is native:
// the slider's amplitude (percent) is passed to it as a gain (volume / 100) unclamped, and the
// engine itself caps the final gain (user volume x output volume) at 10x, so no audio work is
// needed here, only the slider limit and Discord's settings sync:
// - VolumeSlider gets a higher maxVolume wherever Discord leaves it at the default.
// - Volumes above 200% are clamped to 200% before they are synced to your account (as Vencord
//   does), and remembered locally, so the synced 200% coming back doesn't undo the boost.

import { ScrollView } from "react-native";

import { createFileStorage, useProxy } from "@/core/storage";
import { beforeComponentRender } from "@/lib/components";
import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath, findByProps, findByStoreName } from "@/metro";
import { Stack, TableRadioGroup, TableRadioRow, TableRow, TableRowGroup, TableRowTrailingText, Text } from "@/ui/components";

import { definePlugin } from "../types";

const VOLUME_SLIDER = "components_native/common/VolumeSlider.tsx";
const CONNECTION = "../discord_common/js/packages/media-engine/native/Connection.tsx";
const STREAM_VOLUME_SETTING = "modules/user_settings/defs/native/StreamOutputVolumeSetting.tsx";

/** Discord's own user/stream volume maximum, in percent. */
const DISCORD_MAX = 200;
/** The native engine clamps a user's final gain to 10x. */
const ENGINE_MAX = 1000;
const MULTIPLIERS = [1.5, 2, 2.5, 3, 4, 5];

const logger = new Logger("VolumeBooster");

interface Settings {
    multiplier: number;
    /** Volumes above 200%, by "context:userId" (context is "default" for voice, "stream" for streams). */
    boosted: Record<string, number>;
}

const defaults: Settings = { multiplier: 2, boosted: {} };
let settings: Settings = { ...defaults, boosted: {} };
let patcher = createPatcher("VolumeBooster");

const maxAmplitude = () => Math.min(ENGINE_MAX, DISCORD_MAX * (settings.multiplier || defaults.multiplier));
const key = (context: unknown, userId: string) => `${typeof context === "string" ? context : "default"}:${userId}`;
/** Within the slider's rounding of 200%, i.e. the clamped value our sync sent. */
const isClampedValue = (volume: unknown) => typeof volume === "number" && volume >= DISCORD_MAX - 1 && volume <= DISCORD_MAX + 1;

function perceptualMax() {
    const utils = findByProps("perceptualToAmplitude", "amplitudeToPerceptual");
    return utils?.amplitudeToPerceptual?.(maxAmplitude()) ?? maxAmplitude();
}

/**
 * The boosted volume to use instead of `current`, if the user boosted this person and nobody has
 * changed the volume since (the store only holds the boost itself, or the 200% that was synced).
 */
function boostFor(context: unknown, userId: string, current: unknown): number | undefined {
    if (typeof userId !== "string") return undefined;
    const k = key(context, userId);
    const boosted = settings.boosted[k];
    if (typeof boosted !== "number") return undefined;
    if (current === boosted || isClampedValue(current)) return boosted;
    // Changed elsewhere (another device): that wins.
    delete settings.boosted[k];
    return undefined;
}

function patchVolumeStores() {
    // Remember boosts when the user moves a slider (every volume slider ends here).
    const audioActions = findByProps("setLocalVolume", "setOutputVolume", "toggleLocalMute");
    if (audioActions) {
        patcher.before("setLocalVolume", audioActions, ([userId, volume, context]: any[]) => {
            if (typeof userId !== "string" || typeof volume !== "number") return;
            const k = key(context, userId);
            if (volume > DISCORD_MAX + 0.5) settings.boosted[k] = Math.min(volume, ENGINE_MAX);
            else delete settings.boosted[k];
        });
    } else logger.warn("AudioActionCreators not found");

    // What the UI reads (sliders, voice panel icons).
    const mediaEngineStore = findByStoreName("MediaEngineStore");
    if (mediaEngineStore?.getLocalVolume) {
        patcher.after("getLocalVolume", mediaEngineStore, ([userId, context]: any[], volume: any) => boostFor(context, userId, volume));
    } else logger.warn("MediaEngineStore.getLocalVolume not found");

    // What the native engine gets: Connection#setLocalVolume (and user creation) pass
    // getLocalVolume(userId), the stored percent divided by 100.
    const Connection = findByFilePath(CONNECTION)?.default;
    if (typeof Connection?.prototype?.getLocalVolume === "function") {
        patcher.after("getLocalVolume", Connection.prototype, function (this: any, [userId]: any[], gain: any) {
            const stored = this?.localVolumes?.[userId];
            const boosted = boostFor(this?.context, userId, stored);
            if (boosted == null || boosted === stored || typeof gain !== "number") return;
            // Scale Discord's own result rather than assume its divisor.
            return typeof stored === "number" && stored > 0 ? gain * boosted / stored : boosted / 100;
        });
    } else logger.warn("Media engine Connection not found");

    // Discord's account sync of per-user volumes: never send more than Discord's own maximum.
    const pending = findByProps("updatePendingSettings", "drainPendingAudioSettings");
    if (pending) {
        patcher.before("updatePendingSettings", pending, (args: any[]) => {
            const patch = args[2];
            if (patch && typeof patch.volume === "number" && patch.volume > DISCORD_MAX) {
                return [args[0], args[1], { ...patch, volume: DISCORD_MAX }, ...args.slice(3)];
            }
        });
    } else logger.warn("Audio settings sync not found; boosted volumes may be synced unclamped");
}

function patchSliders() {
    // VolumeSlider's maxVolume is perceptual (the slider's scale); callers for user and stream
    // volume leave it unset (Discord's 200%). Settings that pass their own (output, soundboard) are left alone.
    if (!beforeComponentRender(patcher, VOLUME_SLIDER, props => props && props.maxVolume == null ? { ...props, maxVolume: perceptualMax() } : undefined)) {
        logger.warn("VolumeSlider not found");
    }

    // Settings > Voice > Stream volume passes its own maximum.
    const streamSetting = findByFilePath(STREAM_VOLUME_SETTING)?.default;
    if (streamSetting && typeof streamSetting.maximum === "number") {
        const original = streamSetting.maximum;
        const update = () => void (streamSetting.maximum = Math.max(original, perceptualMax()));
        update();
        patcher.addCleanup(() => void (streamSetting.maximum = original));
        patcher.addCleanup(subscribeMultiplier(update));
    }
}

let multiplierListeners = new Set<() => void>();
function subscribeMultiplier(listener: () => void) {
    multiplierListeners.add(listener);
    return () => void multiplierListeners.delete(listener);
}

function setMultiplier(value: number) {
    settings.multiplier = value;
    multiplierListeners.forEach(listener => listener());
}

function resetBoosts() {
    const audioActions = findByProps("setLocalVolume", "setOutputVolume", "toggleLocalMute");
    for (const k of Object.keys(settings.boosted)) {
        const [context, userId] = k.split(":");
        delete settings.boosted[k];
        try {
            audioActions?.setLocalVolume?.(userId, DISCORD_MAX, context);
        } catch (e) {
            logger.error("Failed to reset volume", e);
        }
    }
}

function SettingsPage() {
    useProxy(settings);
    const boostedCount = Object.keys(settings.boosted).length;
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRadioGroup title="Maximum volume" value={String(settings.multiplier)} onChange={(value: string) => setMultiplier(Number(value))}>
                    {MULTIPLIERS.map(multiplier => (
                        <TableRadioRow
                            key={multiplier}
                            label={`${Math.min(ENGINE_MAX, DISCORD_MAX * multiplier)}%`}
                            subLabel={multiplier === 2 ? `×${multiplier} Discord's maximum (default)` : `×${multiplier} Discord's maximum`}
                            value={String(multiplier)}
                        />
                    ))}
                </TableRadioGroup>
                <TableRowGroup title="Boosted volumes">
                    <TableRow
                        label="Reset boosted volumes to 200%"
                        subLabel="Users and streams you turned up past 200%"
                        icon={<TableRow.Icon source={findAssetId("VoiceNormalIcon") ?? findAssetId("RefreshIcon")} />}
                        trailing={<TableRowTrailingText text={String(boostedCount)} />}
                        disabled={boostedCount === 0}
                        onPress={boostedCount ? resetBoosts : undefined}
                    />
                </TableRowGroup>
                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Applies to user volume (hold a user in a call or open their profile) and stream volume. Discord
                    syncs at most 200% to your account, so other devices show 200% for boosted users. Very high
                    values distort; Discord's audio engine caps the final gain at 10×.
                </Text>
            </Stack>
        </ScrollView>
    );
}

export default definePlugin({
    id: "distra:volume-booster",
    manifest: {
        name: "Volume Booster",
        description: "Lets user and stream volume go above Discord's 200% maximum, up to 1000%.",
        authors: [{ name: "Distra" }, { name: "Nuckyz (VolumeBooster)" }, { name: "sadan (VolumeBooster)" }],
        version: "1.0.0",
    },

    async start() {
        settings = await createFileStorage<Settings>("plugins/data/core-volumebooster.json", defaults);
        settings.boosted ??= {};
        if (!MULTIPLIERS.includes(settings.multiplier)) settings.multiplier = defaults.multiplier;
        patcher = createPatcher("VolumeBooster");
        multiplierListeners = new Set();
        patchVolumeStores();
        patchSliders();
    },

    stop() {
        patcher.unpatchAll();
        multiplierListeners.clear();
    },

    SettingsComponent: SettingsPage,

    api: {
        getBoostedVolumes: () => ({ ...settings.boosted }),
        getMaxVolume: maxAmplitude,
    },
});
