import React from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { find, findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import ServerDrawerSheet from "./ServerDrawerSheet";

// The closed dock is wrapped in the dock's own gesture detector, which takes every touch on it:
// a tap opens the dock and any movement drags it, so a row of servers inside it can't scroll or be
// tapped. The row is therefore drawn on top of the dock card instead, outside that detector, and
// handles the vertical swipes itself (up opens the dock, down tucks it away).

const ExternalContext = find((m: any) => m?.QuestDockExternalCoordinationContext)?.QuestDockExternalCoordinationContext;
const QuestDockMode = find((m: any) => m?.QuestDockMode?.COLLAPSED != null)?.QuestDockMode;
const COLLAPSED = QuestDockMode?.COLLAPSED ?? "collapsed";
const Dispatcher = findByProps("dispatch", "subscribe", "unsubscribe");

interface Frame { x: number; y: number; width: number; height: number }

let cardFrame: Frame | null = null;
/** When the card last moved; the row waits for it to settle so it isn't drawn mid-animation. */
let cardMovedAt = 0;
const frameListeners = new Set<() => void>();
const sameFrame = (a: Frame | null, b: Frame) => !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const flatStyle = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatStyle)) : style ?? {};

/**
 * The dock card itself: the closed content slot is laid out away from where the card shows it, so
 * its own position is no use. Walk up from the slot to the rounded, clipping, absolutely placed view.
 */
function findCard(instance: any): any {
    for (let fiber = instance?.__internalInstanceHandle?.return, depth = 0; fiber && depth < 30; fiber = fiber.return, depth++) {
        if (fiber.tag !== 5) continue;
        const style = flatStyle(fiber.memoizedProps?.style);
        if (style.position === "absolute" && style.overflow === "hidden" && style.borderRadius != null) {
            return fiber.stateNode?.canonical?.publicInstance ?? fiber.stateNode;
        }
    }
    return instance;
}

/** Sits in the dock card's closed content and reports where the card is on screen. */
export function CollapsedCardTracker() {
    const ref = React.useRef<View>(null);
    React.useEffect(() => {
        const measure = () => findCard(ref.current)?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
            const next = { x, y, width, height };
            if (sameFrame(cardFrame, next)) return;
            cardFrame = next;
            cardMovedAt = Date.now();
            frameListeners.forEach((listener) => listener());
        });
        measure();
        const timer = setInterval(measure, 100);
        return () => clearInterval(timer);
    }, []);
    return <View ref={ref} collapsable={false} pointerEvents="none" style={st.tracker} />;
}

function useCardFrame() {
    const [frame, setFrame] = React.useState(cardFrame);
    React.useEffect(() => {
        const update = () => setFrame(cardFrame);
        frameListeners.add(update);
        update();
        return () => void frameListeners.delete(update);
    }, []);
    return frame;
}

const CLOSED = QuestDockMode?.CLOSED ?? "closed";
const COLLAPSED_HEIGHT = 56;
/** Set when the user tucks the dock away with the row's own swipe, so it isn't reopened. */
let closedByUser = 0;

/**
 * Whether the dock is resting closed-but-visible (the single row state) with its card settled.
 * Unless "Hide while scrolling" is on, also undoes Discord tucking the dock away when a list scrolls.
 */
function useIsCollapsed(gestureContext: React.Context<any> | null, setMode: (mode: string) => void) {
    const ctx = gestureContext ? React.useContext(gestureContext) as any : null;
    const mode = ctx?.activeQuestDockMode;
    const [collapsed, setCollapsed] = React.useState(false);
    React.useEffect(() => {
        if (!mode) return;
        let last: string | undefined;
        const read = () => {
            try {
                const current = mode.value ?? mode.get?.();
                if (current === CLOSED && last === COLLAPSED && !storage.hideOnScroll && Date.now() - closedByUser > 1500) {
                    setMode(COLLAPSED);
                }
                last = current;
                const settled = cardFrame != null && Date.now() - cardMovedAt > 150
                    && Math.abs(cardFrame.height - COLLAPSED_HEIGHT) < 3;
                setCollapsed(current === COLLAPSED && settled);
            } catch {
                // keep the last known state
            }
        };
        read();
        const timer = setInterval(read, 100);
        return () => clearInterval(timer);
    }, [mode]);
    return collapsed;
}

export default function CollapsedOverlay({ gestureContext }: { gestureContext: React.Context<any> | null }) {
    const ext = ExternalContext ? React.useContext(ExternalContext) as any : null;
    const frame = useCardFrame();

    // Where this overlay's own origin is on screen, to place the row over the card.
    const hostRef = React.useRef<View>(null);
    const [origin, setOrigin] = React.useState<{ x: number; y: number } | null>(null);
    React.useEffect(() => {
        (hostRef.current as any)?.measureInWindow?.((x: number, y: number) => {
            if (!origin || origin.x !== x || origin.y !== y) setOrigin({ x, y });
        });
    });

    const setMode = (mode: string | undefined) => {
        try {
            if (mode) ext?.setRestingQuestDockMode?.(mode);
        } catch {
            // dock coordination unavailable
        }
    };
    const collapsed = useIsCollapsed(gestureContext, setMode);

    // Opening a channel or DM from anywhere (an unread DM, a notification) closes the open dock.
    React.useEffect(() => {
        const onSelect = () => {
            try {
                const ctxMode = ext?.restingQuestDockMode;
                if ((ctxMode?.value ?? ctxMode?.get?.()) === (QuestDockMode?.EXPANDED ?? "expanded")) setMode(COLLAPSED);
            } catch {
                // dock coordination unavailable
            }
        };
        Dispatcher?.subscribe?.("CHANNEL_SELECT", onSelect);
        return () => Dispatcher?.unsubscribe?.("CHANNEL_SELECT", onSelect);
    }, [ext]);
    // Opens as soon as the finger has moved up a little (or flicks up), rather than on release.
    const swipe = React.useMemo(() => {
        let done = false;
        return PanResponder.create({
            onMoveShouldSetPanResponderCapture: (_e, { dx, dy }) => Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx),
            onPanResponderGrant: () => void (done = false),
            onPanResponderMove: (_e, { dy, vy }) => {
                if (done) return;
                if (dy < -14 || vy < -0.4) {
                    done = true;
                    setMode(QuestDockMode?.EXPANDED ?? "expanded");
                }
            },
            onPanResponderRelease: (_e, { dy }) => {
                if (!done && dy > 18) {
                    closedByUser = Date.now();
                    setMode(CLOSED);
                }
            },
            onPanResponderTerminationRequest: () => false,
        });
    }, [ext]);

    const show = collapsed && frame && origin && frame.width > 0;
    return (
        <View ref={hostRef} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {show && (
                <View
                    {...swipe.panHandlers}
                    style={[st.card, { left: frame!.x - origin!.x, top: frame!.y - origin!.y, width: frame!.width, height: frame!.height }]}
                >
                    <ServerDrawerSheet gestureContext={gestureContext} variant="row" />
                </View>
            )}
        </View>
    );
}

const st = StyleSheet.create({
    tracker: { width: "100%", height: "100%" },
    card: { position: "absolute", borderRadius: 16, overflow: "hidden", zIndex: 10 },
});
