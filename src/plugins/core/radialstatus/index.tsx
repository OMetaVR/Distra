// Radial Status: shows a user's status as a colored ring around their avatar instead of
// the small dot. Based on Angelix1's Radial Status, rebuilt on Discord's shared Avatar
// component (design/void/Avatar) so it doesn't depend on exact layout sizes.

import { StyleSheet, View } from "react-native";

import { beforeComponentRender, afterComponentRender } from "@/lib/components";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";

import { definePlugin } from "../types";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";

const AVATAR = "design/void/Avatar/native/Avatar.tsx";
const DECORATION = "modules/collectibles/native/components/CutoutableAvatarDecoration.tsx";

/** Style keys that place the avatar in its parent; they move to the ring, which takes its place. */
const OUTER_KEYS = /^(margin|position$|top$|left$|right$|bottom$|start$|end$|alignSelf$|zIndex$|flex)/;

/** Splits the avatar's style into what stays on the avatar and what the ring wrapper takes over. */
function splitStyle(style: any) {
    const flat = StyleSheet.flatten(style) ?? {};
    const inner: Record<string, any> = {};
    const outer: Record<string, any> = {};
    for (const [key, value] of Object.entries(flat)) (OUTER_KEYS.test(key) ? outer : inner)[key] = value;
    return { inner, outer };
}

/**
 * The ring's style. Negative margins keep the avatar's layout box the size it was (the ring is
 * drawn around it), so neighbours and avatar decorations stay where Discord put them.
 */
function ringStyle(color: string, outer: Record<string, any>) {
    const extra = settings.width + settings.gap;
    const side = (key: string, axis: string) => (outer[key] ?? outer[axis] ?? outer.margin ?? 0) - extra;
    const { margin: _m, marginHorizontal: _h, marginVertical: _v, ...rest } = outer;
    return {
        ...rest,
        marginTop: side("marginTop", "marginVertical"),
        marginBottom: side("marginBottom", "marginVertical"),
        marginLeft: side("marginLeft", "marginHorizontal"),
        marginRight: side("marginRight", "marginHorizontal"),
        // Centered like the avatar was in its row; "stretch" would turn the ring into an oval.
        alignSelf: outer.alignSelf ?? "center",
        borderRadius: 9999,
        borderWidth: settings.width,
        borderColor: color,
        padding: settings.gap,
    };
}

const RING = Symbol.for("distra.radialStatus");
const logger = new Logger("RadialStatus");
let patcher = createPatcher("RadialStatus");

export default definePlugin({
    id: "distra:radial-status",
    manifest: {
        name: "Radial Status",
        description: "Shows status as a colored ring around avatars instead of a dot.",
        authors: [{ name: "Distra" }, { name: "Angelw0lf (Radial Status)" }],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        patcher = createPatcher("RadialStatus");

        const hooked = beforeComponentRender(patcher, AVATAR, props => {
            const color = (settings.colors as Record<string, string>)[props?.status];
            if (!color) return;
            // Hide the dot (and its cutout); the ring takes over the avatar's placement in its parent.
            const { inner, outer } = splitStyle(props.style);
            return { ...props, style: inner, status: undefined, isMobileOnline: false, autoStatusCutout: false, cutout: undefined, [RING]: { color, outer } };
        }) && afterComponentRender(patcher, AVATAR, (props, element) => {
            const ring = props?.[RING];
            if (!ring) return;
            return <View style={ringStyle(ring.color, ring.outer)}>{element}</View>;
        });
        // Avatar decorations are cut out where the status dot was; there's no dot anymore.
        beforeComponentRender(patcher, DECORATION, props => props?.cutout ? { ...props, cutout: undefined } : undefined);
        if (!hooked) logger.warn("Avatar component not found");
    },

    stop() {
        patcher.unpatchAll();
    },

    SettingsComponent: SettingsPage,
});
