import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";

import { definePlugin } from "../types";
import { onLoggedChange, OWN_EVENT, patchDispatcher } from "./capture";
import * as db from "./db";
import { removeKeptMessages } from "./flush";
import LoggerSettingsPage from "./SettingsPage";
import { patchRows } from "./render";
import { loadSettings, settings } from "./settings";
import { isDeleted, logged, remember, rememberEdit, reset } from "./state";

const logger = new Logger("MessageLogger");
let patcher = createPatcher("MessageLogger");

export { onLoggedChange, OWN_EVENT };

export default definePlugin({
    id: "discordia:message-logger",
    manifest: {
        name: "Message Logger",
        description: "Keeps deleted messages (in red, with greyed-out images) and shows edit history above edited messages. Saved on your device, so it survives restarts.",
        authors: [{ name: "Discordia" }],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        await db.migrate();

        const day = 24 * 60 * 60 * 1000;
        const since = Date.now() - settings.retentionDays * day;
        await db.prune(since, settings.maxMessages).catch(e => logger.warn("Prune failed", e));

        const { messages, edits } = await db.loadRecent(since, settings.maxMessages);
        messages.forEach(remember);
        edits.forEach(rememberEdit);
        logger.info(`Loaded ${messages.length} logged messages (${messages.filter(m => isDeleted(m.id)).length} deleted, ${new Set(edits.map(e => e.message_id)).size} edited)`);

        patcher = createPatcher("MessageLogger");
        patchDispatcher(patcher);
        patchRows(patcher);
    },

    stop() {
        patcher.unpatchAll();
        // Take the deleted messages we kept on screen out of the chat again.
        removeKeptMessages([...logged.values()].filter(m => isDeleted(m.id)));
        reset();
    },

    SettingsComponent: LoggerSettingsPage,
});
