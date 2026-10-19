// Timezones: set people's time zones and see their local time in their profile and next to their
// messages' timestamps. Port of Equicord's Timezones (GPL-3.0-or-later, by Aria and creations),
// including its public timezone database (read-only here). On mobile:
//   - the zone is set from a profile's "..." menu (Set Time Zone), the time line in the profile, or
//     the settings page (the desktop plugin's user context menu and modal);
//   - the profile gets a local time line under the name (UserProfilePrimaryInfo);
//   - chat rows are native, so the time is appended to the header timestamp string in the row data
//     (RowManager#generate), at the time the message was sent, like the desktop plugin.

import { createPatcher } from "@/lib/patcher";
import { addProfileMenuItems } from "@/lib/profileMenu";
import { afterComponentRender } from "@/lib/components";
import { Logger } from "@/lib/logger";
import { appendRowTimestamp } from "@/lib/rowTimestamp";
import { findByNameLazy } from "@/metro";

import { definePlugin } from "../types";
import { loadDatabase, refreshDatabase } from "./database";
import ProfileTime from "./ProfileTime";
import { loadSettings, settings } from "./settings";
import SettingsPage from "./SettingsPage";
import { openZonePickerFromSheet } from "./sheets";
import { systemZone, timeIn } from "./time";
import { resolveZone, setUserZone, shouldShow } from "./zonesStore";

const logger = new Logger("Timezones");
const RowManager = findByNameLazy("RowManager");
const PRIMARY_INFO = "modules/user_profile/native/UserProfilePrimaryInfo.tsx";
let patcher = createPatcher("Timezones");

function patchRows() {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        if (!settings.showInMessages || data?.rowType !== 1 || typeof row?.message?.timestamp !== "string") return;
        const authorId = data.message?.author?.id;
        if (!authorId || !shouldShow(authorId)) return;
        const resolved = resolveZone(authorId);
        // Same zone as yours: the timestamp already says it.
        if (!resolved || resolved.zone === systemZone()) return;
        const sent = new Date(+data.message.timestamp);
        if (Number.isNaN(sent.getTime())) return;
        const time = timeIn(resolved.zone, sent);
        if (time) appendRowTimestamp(row.message, ` (${time})`);
    });
}

export default definePlugin({
    id: "distra:timezones",
    manifest: {
        name: "Timezones",
        description: "Set people's time zones (or get them from the public timezone database) and see their local time in their profile and next to their messages.",
        authors: [{ name: "Distra" }, { name: "Aria, creations (Equicord Timezones)" }],
        version: "1.0.0",
    },
    async start() {
        await loadSettings();
        patcher = createPatcher("Timezones");
        loadDatabase().catch(e => logger.warn("Timezone database unavailable", e));
        patchRows();

        const profile = afterComponentRender(patcher, PRIMARY_INFO, (props, element) => {
            const userId = props?.user?.id;
            if (!userId) return;
            return <>{element}<ProfileTime userId={userId} /></>;
        });
        const menu = addProfileMenuItems(patcher, props => {
            const userId = props?.user?.id;
            if (!userId) return;
            return [{ label: settings.zones[userId] ? "Change Time Zone" : "Set Time Zone", action: () => openZonePickerFromSheet(userId) }];
        });
        if (!profile) logger.warn("Profile not found; local times won't show in profiles");
        if (!menu) logger.warn("Profile menu not found; set time zones from the plugin's settings");
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
    api: { resolveZone, setUserZone, timeIn, refreshDatabase },
});
