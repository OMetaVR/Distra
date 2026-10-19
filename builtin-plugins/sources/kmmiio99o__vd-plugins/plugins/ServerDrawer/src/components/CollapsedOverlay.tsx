import React from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { find, findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import ServerDrawerSheet from "./ServerDrawerSheet";
import { subscribeDockMode } from "../utils/dockMode";

// The closed dock is wrapped in the dock's own gesture detector, which takes every touch on it:
// a tap opens the dock and any movement drags it, so a row of servers inside it can't scroll or be
// tapped. The row is therefore drawn on top of the dock card instead, outside that detector, and
// handles the vertical swipes itself (up opens the dock, down tucks it away).
//
// The row can't follow the card's animations (positions arrive a frame or more late), so it simply
// appears where the settled card will be shortly after the dock starts opening, and disappears the
// moment the dock starts closing.
//
// When the dock is tucked away (only its notch showing) the same detector would turn a tap into the
// full drawer; a touch layer over the notch makes a tap bring back the server row instead, while a
// swipe up still opens the drawer.

const ExternalContext = find((m: any) => m?.QuestDockExternalCoordinationContext)?.QuestDockExternalCoordinationContext;
const QuestDockMode = find((m: any) => m?.QuestDockMode?.COLLAPSED != null)?.QuestDockMode;
const COLLAPSED = QuestDockMode?.COLLAPSED ?? "collapsed";
const Dispatcher = findByProps("dispatch", "subscribe", "unsubscribe");

interface Frame { x: number; y: number; width: number; height: number }

let cardFrame: Frame | null = null;
/** Where the card was last seen settled as the row; the row is drawn there while the card opens. */
let settledFrame: Frame | null = null;
/** Measures the card again (set by the mounted tracker). */
let remeasureCard: (() => void) | undefined;
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
    const card = React.useRef<any>(null);
    React.useEffect(() => {
        const measure = () => {
            card.current ??= findCard(ref.current);
            card.current?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
                const next = { x, y, width, height };
                if (sameFrame(cardFrame, next)) return;
                cardFrame = next;
                if (Math.abs(height - COLLAPSED_HEIGHT) < 3) settledFrame = next;
                frameListeners.forEach((listener) => listener());
            });
        };
        // The card only moves when the dock changes mode (and on rotation, which re-lays this out):
        // measure then, a few times while it animates, instead of on a timer.
        let timers: ReturnType<typeof setTimeout>[] = [];
        const burst = () => {
            timers.forEach(clearTimeout);
            timers = [0, 120, 300, 550, 900, 1400].map((delay) => setTimeout(measure, delay));
        };
        remeasureCard = burst;
        burst();
        return () => {
            timers.forEach(clearTimeout);
            if (remeasureCard === burst) remeasureCard = undefined;
        };
    }, []);
    return <View ref={ref} collapsable={false} pointerEvents="none" style={st.tracker} onLayout={() => remeasureCard?.()} />;
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
/** Discord's dock opens in ~0.23s; the row appears just before it finishes. */
const SHOW_AFTER_MS = 140;

const WRAPPED = Symbol.for("serverDrawer.setRestingQuestDockMode");
const requestListeners = new Set<(mode: string) => void>();
/**
 * Calls `listener` with the mode whenever anything asks the dock to change mode (the start of its
 * animation). Wraps the coordination context's setter in place, so every caller goes through it.
 */
function onDockModeRequested(ext: any, listener: (mode: string) => void): () => void {
    if (ext && typeof ext.setRestingQuestDockMode === "function" && !ext.setRestingQuestDockMode[WRAPPED]) {
        const original = ext.setRestingQuestDockMode;
        const wrapped = function (this: any, mode: string, ...rest: any[]) {
            if (typeof mode === "string") requestListeners.forEach((fn) => fn(mode));
            return original.call(this, mode, ...rest);
        };
        (wrapped as any)[WRAPPED] = true;
        try {
            ext.setRestingQuestDockMode = wrapped;
        } catch {
            // frozen context value: closing is then seen when it finishes
        }
    }
    requestListeners.add(listener);
    return () => void requestListeners.delete(listener);
}
/** Set when the user tucks the dock away with the row's own swipe, so it isn't reopened. */
let closedByUser = 0;

/**
 * The dock's mode, and whether it's resting closed-but-visible (the single row state) with its card
 * settled. Unless "Hide while scrolling" is on, also undoes Discord tucking the dock away when a list
 * scrolls.
 */
function useDockState(gestureContext: React.Context<any> | null, setMode: (mode: string) => void, frame: Frame | null) {
    const ctx = gestureContext ? React.useContext(gestureContext) as any : null;
    const shared = ctx?.activeQuestDockMode;
    const [mode, setCurrent] = React.useState<string | undefined>(undefined);
    React.useEffect(() => {
        let last: string | undefined;
        return subscribeDockMode(shared, (current) => {
            if (current === CLOSED && last === COLLAPSED && !storage.hideOnScroll && Date.now() - closedByUser > 1500) {
                setMode(COLLAPSED);
            }
            last = current;
            setCurrent(current);
            remeasureCard?.();
        });
    }, [shared]);
    const collapsed = mode === COLLAPSED && frame != null && Math.abs(frame.height - COLLAPSED_HEIGHT) < 3;
    const tucked = mode === CLOSED && frame != null && frame.height > 0 && frame.height < COLLAPSED_HEIGHT - 3;
    return { collapsed, tucked };
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

    // Where the dock is heading. Discord's active mode only changes once an animation ends, so the
    // row follows this instead: it appears as the card starts growing and leaves as it starts shrinking.
    const [target, setTargetState] = React.useState<string | undefined>(undefined);
    const [ready, setReady] = React.useState(false);
    const readyTimer = React.useRef<ReturnType<typeof setTimeout>>();
    const targetRef = React.useRef<string | undefined>(undefined);
    const setTarget = (mode: string | undefined) => {
        // The same mode reported again (our call, then Discord's shared value catching up) changes nothing.
        if (mode === targetRef.current) return;
        targetRef.current = mode;
        setTargetState(mode);
        clearTimeout(readyTimer.current);
        setReady(false);
        if (mode === COLLAPSED) readyTimer.current = setTimeout(() => setReady(true), SHOW_AFTER_MS);
    };
    // Discord only updates the resting mode once a closing animation has finished, but every change
    // goes through setRestingQuestDockMode, so that call marks the start of an animation.
    React.useEffect(() => onDockModeRequested(ext, (mode) => {
        setTarget(mode);
        remeasureCard?.();
    }), [ext]);
    React.useEffect(() => subscribeDockMode(ext?.restingQuestDockMode, (mode) => {
        setTarget(mode);
        remeasureCard?.();
    }), [ext?.restingQuestDockMode]);
    React.useEffect(() => () => clearTimeout(readyTimer.current), []);

    const setMode = (mode: string | undefined) => {
        try {
            if (!mode) return;
            ext?.setRestingQuestDockMode?.(mode);
            setTarget(mode);
            remeasureCard?.();
        } catch {
            // dock coordination unavailable
        }
    };
    const { collapsed: settled, tucked } = useDockState(gestureContext, setMode, frame);
    // With a readable resting mode: shown a moment after the dock heads to the row (or as soon as
    // the card is seen settled), gone the moment it heads anywhere else. Older Discord: settled only.
    const collapsed = ext?.restingQuestDockMode ? target === COLLAPSED && (ready || settled) : settled;

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

    // The tucked-away notch: a tap brings the server row back, a swipe up opens the drawer.
    const notch = React.useMemo(() => {
        let done = false;
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => void (done = false),
            onPanResponderMove: (_e, { dy, vy }) => {
                if (done) return;
                if (dy < -14 || vy < -0.4) {
                    done = true;
                    setMode(QuestDockMode?.EXPANDED ?? "expanded");
                }
            },
            onPanResponderRelease: (_e, { dx, dy }) => {
                if (!done && Math.abs(dx) < 10 && Math.abs(dy) < 10) setMode(COLLAPSED);
            },
            onPanResponderTerminationRequest: () => false,
        });
    }, [ext]);

    const placed = frame && origin && frame.width > 0;
    // Drawn where the card settles; before it has ever been seen settled, where it is now.
    const at = collapsed && !settled && settledFrame ? settledFrame : frame;
    const show = !!(collapsed && at && origin && at.width > 0);
    return (
        <View ref={hostRef} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {show && (
                <View
                    {...swipe.panHandlers}
                    style={[st.card, { left: at!.x - origin!.x, top: at!.y - origin!.y, width: at!.width, height: COLLAPSED_HEIGHT }]}
                >
                    {/* Laid out at its final height, so a growing card reveals it instead of squashing it. */}
                    <View style={st.rowContent}>
                        <ServerDrawerSheet gestureContext={gestureContext} variant="row" />
                    </View>
                </View>
            )}
            {tucked && target !== COLLAPSED && placed && (
                <View
                    {...notch.panHandlers}
                    style={[st.notch, {
                        left: frame!.x - origin!.x,
                        top: frame!.y - origin!.y - NOTCH_SLOP,
                        width: frame!.width,
                        height: frame!.height + NOTCH_SLOP * 2,
                    }]}
                />
            )}
        </View>
    );
}

/** Extra touch area above and below the thin notch. */
const NOTCH_SLOP = 8;

const st = StyleSheet.create({
    tracker: { width: "100%", height: "100%" },
    card: { position: "absolute", borderRadius: 16, overflow: "hidden", zIndex: 10 },
    notch: { position: "absolute", zIndex: 10 },
    rowContent: { position: "absolute", top: 0, left: 0, right: 0, height: COLLAPSED_HEIGHT },
});
