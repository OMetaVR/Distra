import React from "react";
import { StyleSheet, View } from "react-native";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { ICON, RADIUS } from "../utils/metrics";
import { useTextColor } from "../utils/theme";

const Flux = findByProps("useStateFromStores");
const SelectedGuildStore = findByStoreName("SelectedGuildStore");

/** Scale of a selected tile's icon, leaving a gap inside the ring. */
export const SELECTED_SCALE = 0.78;

/** Whether the server you're in is `guildId` (or, for a folder, one of `guildIds`). */
export function useIsSelected(guildIds: string[]): boolean {
    return Flux?.useStateFromStores?.(
        [SelectedGuildStore],
        () => guildIds.includes(SelectedGuildStore?.getGuildId?.()),
        [guildIds.join()],
    ) ?? false;
}

/** The gapped outline around the selected server, in the theme's message text colour. */
export default function SelectionRing() {
    const color = useTextColor();
    return <View pointerEvents="none" style={[st.ring, { borderColor: color }]} />;
}

const st = StyleSheet.create({
    ring: { position: "absolute", top: 0, left: 0, width: ICON, height: ICON, borderRadius: RADIUS, borderWidth: 2 },
});
