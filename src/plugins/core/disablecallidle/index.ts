// Disable Call Idle: Discord ends a DM call after 3 minutes when you're the only one left in it. Port of
// Vencord's DisableCallIdle (GPL-3.0-or-later, by Nuckyz). On 348 that's CallIdleManager's idleTimeout, started
// from its voice state handlers; its start is made a no-op (and a running one stopped). Mobile has no
// AFK-channel move on system idle, the other half of the desktop plugin.

import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath } from "@/metro";

import { definePlugin } from "../types";

const logger = new Logger("DisableCallIdle");
let patcher = createPatcher("DisableCallIdle");

export default definePlugin({
    id: "distra:disable-call-idle",
    manifest: {
        name: "Disable Call Idle",
        description: "Stops Discord from hanging up a DM call after 3 minutes when you're the only one left in it.",
        authors: [{ name: "Distra" }, { name: "Nuckyz (Vencord DisableCallIdle)" }],
        version: "1.0.0",
    },
    start() {
        patcher = createPatcher("DisableCallIdle");
        const timeout = findByFilePath("modules/voice_calls/CallIdleManager.tsx")?.default?.idleTimeout;
        if (typeof timeout?.start !== "function") return logger.warn("Call idle timer not found");
        timeout.stop?.();
        patcher.instead("start", timeout, () => undefined);
    },
    stop() {
        patcher.unpatchAll();
    },
});
