// Hide Messages: hide single messages on this device from their long-press menu ("Hide Message").
// A hidden message collapses to a "Hidden message · tap to show" line under its author; tap it, or
// choose "Show Message" in its long-press menu, to bring it back. Nothing is sent to Discord.
// Mobile take on Vencord/Equicord's HideMedia (by Vendicated), for whole messages.

import { addMessageSheetRows } from "@/lib/messageSheet";
import { createPatcher } from "@/lib/patcher";
import { redrawMessageList } from "@/lib/rowRedraw";

import { definePlugin } from "../types";
import { hideMessage, showMessage } from "./actions";
import { patchRows, patchTaps } from "./render";
import SettingsPage from "./SettingsPage";
import * as store from "./store";

let patcher = createPatcher("HideMessages");
let removeRows: (() => void) | undefined;

export default definePlugin({
    id: "distra:hide-messages",
    manifest: {
        name: "Hide Messages",
        description: "Hide single messages on this device from their long-press menu. Hidden messages collapse to a line you can tap to show them again.",
        authors: [{ name: "Distra" }, { name: "Vendicated (Vencord HideMedia)" }],
        version: "1.0.0",
    },

    async start() {
        await store.loadSettings();
        patcher = createPatcher("HideMessages");
        patchRows(patcher);
        patchTaps(patcher, showMessage);
        removeRows = addMessageSheetRows(message => {
            const channelId = message.channel_id;
            if (!message.id || !channelId) return null;
            return store.isHidden(message.id)
                ? { key: "distra-show-message", label: "Show Message", icon: "EyeIcon", onPress: () => showMessage(message.id, channelId) }
                : { key: "distra-hide-message", label: "Hide Message", icon: "EyeSlashIcon", onPress: () => hideMessage(message.id, channelId) };
        });
        redrawMessageList(store.hiddenMessages());
    },

    stop() {
        removeRows?.();
        removeRows = undefined;
        patcher.unpatchAll();
        redrawMessageList(store.hiddenMessages());
        store.resetSession();
    },

    SettingsComponent: SettingsPage,
    api: {
        hideMessage,
        showMessage,
        isHidden: store.isHidden,
        hiddenMessages: store.hiddenMessages,
        setRemember: store.setRemember,
        clearHidden: () => redrawMessageList(store.clearHidden()),
    },
});
