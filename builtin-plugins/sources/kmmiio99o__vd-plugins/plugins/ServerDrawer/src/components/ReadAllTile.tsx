import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ICON, RADIUS } from "../utils/metrics";
import { Themes, useTextColor, useTokenColor } from "../utils/theme";

const WIDTH = 22;

/** Read All's own action, when that plugin is on (it shares it as `globalThis.__readAllPress`). */
const readAll = () => (globalThis as any).__readAllPress as (() => void) | undefined;

/** A thin tile with "Read All" running sideways, for the drawer's row and grid. */
export default function ReadAllTile() {
    const press = readAll();
    const background = useTokenColor(Themes?.colors?.MOBILE_GUILDBAR_ICON_BACKGROUND_DEFAULT);
    const color = useTextColor();
    if (!press) return null;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read All"
            onPress={() => readAll()?.()}
            onLongPress={() => ((globalThis as any).__readAllLongPress ?? readAll())?.()}
            delayLongPress={450}
        >
            <View style={[st.tile, { backgroundColor: background }]}>
                <Text numberOfLines={1} style={[st.label, { color }]}>Read All</Text>
            </View>
        </Pressable>
    );
}

const st = StyleSheet.create({
    tile: { width: WIDTH, height: ICON, borderRadius: Math.min(RADIUS, WIDTH / 2), alignItems: "center", justifyContent: "center" },
    // Rotated text is laid out before turning, so it gets the tile's height (plus room) as its width.
    label: { width: ICON + 24, textAlign: "center", fontSize: 8, fontWeight: "700", transform: [{ rotate: "-90deg" }] },
});
