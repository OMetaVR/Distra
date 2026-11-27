// Remote Commands: slash commands defined and run by external backends (docs/REMOTE_COMMANDS.md).
// The plugin holds no command logic; see backends.ts.

import { definePlugin } from "../types";
import { getState, loadBackend, startAll, stopAll } from "./backends";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";

export default definePlugin({
    id: "distra:remote-commands",
    manifest: {
        name: "Remote Commands",
        description: "Slash commands from your own backends: any server that speaks the Remote Commands protocol can add commands to Discord.",
        authors: [{ name: "Distra" }],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        await startAll();
    },

    stop: stopAll,

    SettingsComponent: SettingsPage,
    api: { loadBackend, getState, getSettings: () => settings },
});
