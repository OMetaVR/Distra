// Swipe to collapse the chat bar's buttons: swiping the right-hand buttons (emoji, gift) to the
// right, or the left-hand ones (+, apps) to the left, tucks both sets away so the text field gets
// the room. A small chevron at the right edge, or a swipe left from the right side, brings them back.

import { useEffect, useReducer, useRef } from "react";
import { Image, LayoutAnimation, PanResponder, Pressable, View } from "react-native";

import { findAssetId } from "@/lib/assets";
import { semanticColors, resolveSemanticColor } from "@/ui/color";

const SWIPE_DISTANCE = 28;

let collapsed = false;
const listeners = new Set<() => void>();

function setCollapsed(value: boolean) {
    if (collapsed === value) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    collapsed = value;
    listeners.forEach(listener => listener());
}

function useCollapsed() {
    const [, rerender] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(rerender);
        return () => void listeners.delete(rerender);
    }, []);
    return collapsed;
}

/** `dx` moves that collapse (+1 = swiping right collapses) for this cluster. */
function useSwipe(collapseDirection: 1 | -1) {
    return useRef(PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) =>
            Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5,
        onPanResponderRelease: (_event, { dx }) => {
            if (dx * collapseDirection > SWIPE_DISTANCE) setCollapsed(true);
            else if (dx * collapseDirection < -SWIPE_DISTANCE) setCollapsed(false);
        },
    })).current;
}

/** Wraps the buttons on one side of the chat bar. `side` is the edge they sit against. */
export function SwipeCluster({ side, children }: { side: "left" | "right"; children: any }) {
    const isCollapsed = useCollapsed();
    const swipe = useSwipe(side === "right" ? 1 : -1);
    const tint = resolveSemanticColor(semanticColors.INTERACTIVE_NORMAL);

    if (isCollapsed) {
        // The right cluster leaves a chevron behind; the left one simply goes.
        if (side === "left") return null;
        return (
            <View {...swipe.panHandlers}>
                <Pressable accessibilityLabel="Show chat buttons" hitSlop={8} onPress={() => setCollapsed(false)} style={{ width: 24, height: 32, alignItems: "center", justifyContent: "center" }}>
                    <Image source={findAssetId("ChevronSmallRightIcon")} style={{ width: 20, height: 20, tintColor: tint, transform: [{ rotate: "180deg" }] }} />
                </Pressable>
            </View>
        );
    }
    return (
        <View {...swipe.panHandlers} style={{ flexDirection: "row", alignItems: "center" }}>
            {children}
        </View>
    );
}
