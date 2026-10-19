// Who's Typing: typing indicators on server channels and DMs, and a richer "X is typing..." line.
// Port of Vencord/Equicord's TypingIndicator (Nuckyz, fawn, Sqaaakoi) and TypingTweaks (zt, sadan)
// (GPL-3.0-or-later) for mobile, as one plugin:
//
//   - channel rows (channel_list_v2 TextChannel / ThreadChannel) get a badge; DM rows swap the last-message
//     preview for the typing text while someone types (rows.tsx);
//   - the typing line above the chat input gets avatars, role colours and tappable names (line.tsx).

import { afterComponentRender } from "@/lib/components";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";

import { definePlugin } from "../types";
import { withTweakedLine } from "./line";
import { patchChannelRows, patchDmRows } from "./rows";
import { loadSettings } from "./settings";
import SettingsPage from "./SettingsPage";

const logger = new Logger("WhosTyping");
let patcher = createPatcher("WhosTyping");

const TYPING_LINE = "modules/chat/native/TypingIndicator.tsx";

export default definePlugin({
    id: "distra:whos-typing",
    manifest: {
        name: "Who's Typing",
        description: "Shows who is typing on server channels and in your DM list, and adds avatars, role colours and tappable names to the typing line above the chat box.",
        authors: [
            { name: "Distra" },
            { name: "Nuckyz, fawn, Sqaaakoi (Vencord/Equicord TypingIndicator)" },
            { name: "zt, sadan (Vencord/Equicord TypingTweaks)" },
        ],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        patcher = createPatcher("WhosTyping");
        try {
            const missing = patchChannelRows(patcher);
            if (missing.length) logger.warn(`Channel rows not found: ${missing.join(", ")}`);
        } catch (e) {
            logger.error("Couldn't patch the server channel rows", e);
        }
        try {
            if (!patchDmRows(patcher)) logger.warn("DM row preview not found; DMs won't show typing text");
        } catch (e) {
            logger.error("Couldn't patch the DM rows", e);
        }
        try {
            if (!afterComponentRender(patcher, TYPING_LINE, (_, element) => withTweakedLine(element))) logger.warn("Typing line not found");
        } catch (e) {
            logger.error("Couldn't patch the typing line", e);
        }
    },

    stop() {
        patcher.unpatchAll();
    },

    SettingsComponent: SettingsPage,
});
