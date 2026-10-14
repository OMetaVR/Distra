import { storage } from "@vendetta/plugin";
import { findByStoreName } from "@vendetta/metro";
import { ReactNative, FluxDispatcher } from "@vendetta/metro/common";
import MoyaiSettings from "./settings";

const { DCDSoundManager } = ReactNative.NativeModules;
const SelectedChannelStore = findByStoreName("SelectedChannelStore");

// Distra: iOS can't play the original OGG (Metastruct/garrysmod-chatsounds "overused thud"); this is an MP3 of it.
const THUD_URL =
  ((globalThis as any).__DISTRA_ASSET_BASE__ ?? "https://raw.githubusercontent.com/OMetaVR/Distra/main/builtin-plugins/assets/") + "moyai-thud.mp3";
const SOUND_ID = 6969;
let SOUND_DURATION = -1;

const prepareSound = () =>
    new Promise((resolve) => {
        try {
            DCDSoundManager.prepare(THUD_URL, "media", SOUND_ID, (_, meta) =>
                resolve(meta)
            );
        } catch {
            resolve({ duration: 1000 });
        }
    });
let playingTimeout: ReturnType<typeof setTimeout> | null = null;
let playing = false;
async function playSound() {
    if (!soundPrepared) return;
    try {
        if (playing) {
            if (playingTimeout != null) clearTimeout(playingTimeout);
            DCDSoundManager.stop(SOUND_ID);
            playing = false;
        }
        playing = true;
        await DCDSoundManager.play(SOUND_ID);
        playingTimeout = setTimeout(() => {
            playing = false;
            if (soundPrepared) DCDSoundManager.stop(SOUND_ID);
            playingTimeout = null;
        }, SOUND_DURATION);
    } catch {
        playing = false;
    }
}

const moyaiRegex = /🗿|<a?:.*?moy?ai.*?:\d+>/gi;

function onMessage(event) {
    try {
        if (
            event.message?.content &&
        event.channelId == SelectedChannelStore.getChannelId() &&
        !event.message.state
        ) {
            const matches = event.message.content.match(moyaiRegex);
            if (matches) {
                for (let i = 0; i < matches.length; i++) {
                    setTimeout(playSound, i * 350);
                }
            }
        }
    } catch {
        // ignore
    }
}

const recentReactions = new Set<string>();

function onReaction(event) {
    try {
        if (
            (storage.allowReactions ?? true) &&
        event.channelId == SelectedChannelStore.getChannelId()
        ) {
            const name = event.emoji?.name;
            if (name === "🗿" || (name && /moy?ai/i.test(name))) {
                const key = `${event.messageId}:${name}`;
                if (recentReactions.has(key)) return;
                recentReactions.add(key);
                setTimeout(() => recentReactions.delete(key), 500);
                playSound();
            }
        }
    } catch {
        // ignore
    }
}

let soundPrepared = false;

export default {
    onLoad: () => {
        if (!soundPrepared) {
            prepareSound().then((meta: Record<string, number>) => {
                soundPrepared = true;
                SOUND_DURATION = meta.duration;
            });
        }
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessage);
        FluxDispatcher.subscribe("MESSAGE_REACTION_ADD", onReaction);
    },
    onUnload: () => {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessage);
        FluxDispatcher.unsubscribe("MESSAGE_REACTION_ADD", onReaction);
        recentReactions.clear();
    },
    settings: MoyaiSettings,
};
