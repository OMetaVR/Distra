import React from "react";
import { StyleSheet, View } from "react-native";
import { ICON } from "../utils/metrics";
import { useDividerColor } from "../utils/theme";

export type DividerKind = "line" | "spacer" | "vertical";

/**
 * Marks where one group of tiles ends (DMs before servers, an open folder's servers before the
 * rest). In the wrapping grid a line or blank break across the row; in the sideways row a short
 * vertical line.
 */
export default function Divider({ kind }: { kind: DividerKind }) {
    const color = useDividerColor();
    if (kind === "vertical") return <View style={[st.vertical, { backgroundColor: color }]} />;
    if (kind === "spacer") return <View style={st.spacer} />;
    return <View style={[st.line, { backgroundColor: color }]} />;
}

const st = StyleSheet.create({
    vertical: { width: 2, height: Math.round(ICON * 0.6), marginTop: Math.round(ICON * 0.2), borderRadius: 1 },
    spacer: { width: "100%", height: 2 },
    line: { width: "100%", height: StyleSheet.hairlineWidth * 2, marginVertical: 4, borderRadius: 1 },
});
