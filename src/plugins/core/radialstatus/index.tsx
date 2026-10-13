// Radial Status: shows a user's status as a colored ring around their avatar instead of
// the small dot. Based on Angelix1's Radial Status, rebuilt on Discord's shared Avatar
// component (design/void/Avatar) so it doesn't depend on exact layout sizes.

import { View } from "react-native";

import { beforeComponentRender, afterComponentRender } from "@/lib/components";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";

import { definePlugin } from "../types";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";

const AVATAR = "design/void/Avatar/native/Avatar.tsx";
const RING = Symbol.for("discordia.radialStatus");
const logger = new Logger("RadialStatus");
let patcher = createPatcher("RadialStatus");

export default definePlugin({
    id: "discordia:radial-status",
    manifest: {
        name: "Radial Status",
        description: "Shows status as a colored ring around avatars instead of a dot.",
        authors: [{ name: "Discordia" }, { name: "Angelw0lf (Radial Status)" }],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        patcher = createPatcher("RadialStatus");

        const hooked = beforeComponentRender(patcher, AVATAR, props => {
            const color = (settings.colors as Record<string, string>)[props?.status];
            if (!color) return;
            // Hide the dot (and its cutout); remember the color for the ring.
            return { ...props, status: undefined, isMobileOnline: false, autoStatusCutout: false, cutout: undefined, [RING]: color };
        }) && afterComponentRender(patcher, AVATAR, (props, element) => {
            const color = props?.[RING];
            if (!color) return;
            return (
                <View style={{ borderRadius: 9999, borderWidth: settings.width, borderColor: color, padding: settings.gap, alignSelf: "flex-start" }}>
                    {element}
                </View>
            );
        });
        if (!hooked) logger.warn("Avatar component not found");
    },

    stop() {
        patcher.unpatchAll();
    },

    SettingsComponent: SettingsPage,
});
