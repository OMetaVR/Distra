import React from "react";
import { View, Text, Pressable, Animated, Dimensions, StyleSheet, BackHandler, ScrollView } from "react-native";
import { find, findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { GuildNode } from "../utils/theme";
import { getGestureContext } from "../utils/gestureContext";
import GuildItem from "./GuildItem";
import FolderItem from "./FolderItem";
import DmTile, { UnreadDmTile, useUnreadDms } from "./DmTile";
import Divider, { DividerKind } from "./Dividers";
import ReadAllTile from "./ReadAllTile";
import { useDockMode } from "../utils/dockMode";

const Flux = findByProps("useStateFromStores");
const SortedGuildStore = findByStoreName("SortedGuildStore");
const RootNav = findByProps("getRootNavigationRef");
const Haptic = findByProps("triggerHapticFeedback", "HapticFeedbackTypes");
const Routing = findByProps("transitionToGuild");

const CreateGuildMod = find((m: any) => typeof m?.openCreateGuildModal === "function");
const CirclePlusIcon = find((m: any) => m?.CirclePlusIcon)?.CirclePlusIcon;
const rawColors = findByProps("colors", "unsafe_rawColors")?.unsafe_rawColors;

const createJoinBg = rawColors?.GREEN_360;
const createJoinIconColor = rawColors?.WHITE;

const ExternalCoordinationMod = find((m: any) => m?.QuestDockExternalCoordinationContext);
const ExternalContext = ExternalCoordinationMod?.QuestDockExternalCoordinationContext;
const QuestDockMode = find((m: any) => m?.QuestDockMode?.COLLAPSED != null)?.QuestDockMode;

const CompassIcon = find((m: any) => m?.CompassIcon)?.CompassIcon;

// Compatibility with the Discovery plugin: show a discovery tile in the grid when it's installed
function isDiscoveryEnabled(): boolean {
    const plugins = (globalThis as any)?.vendetta?.plugins?.plugins;
    if (!plugins) return false;
    return Object.values(plugins).some(
        (p: any) => p?.manifest?.name === "Discovery" && p?.enabled,
    );
}

function DiscoveryTile({ onPress }: { onPress: () => void }) {
    const scale = React.useRef(new Animated.Value(1)).current;
    const scaleDown = React.useCallback(() => {
        Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
    }, [scale]);
    const scaleUp = React.useCallback(() => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    }, [scale]);

    const bg = rawColors?.INTERACTIVE_ACTIVE ?? "#41434a";

    return (
        <Pressable onPress={onPress} onPressIn={scaleDown} onPressOut={scaleUp}>
            <Animated.View style={[st.discoveryTile, { backgroundColor: bg, transform: [{ scale }] }]}>
                {CompassIcon ? (
                    <CompassIcon size="md" color={rawColors?.WHITE} />
                ) : (
                    <Text style={st.createJoinFallback}>{"⌖"}</Text>
                )}
            </Animated.View>
        </Pressable>
    );
}

import { GAP, ICON, PAD, RADIUS, TOP_PAD } from "../utils/metrics";

const FallbackGestureContext = React.createContext(null);

function CreateJoinButton({ onPress }: { onPress: () => void }) {
    const scale = React.useRef(new Animated.Value(1)).current;
    const scaleDown = React.useCallback(() => {
        Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
    }, [scale]);
    const scaleUp = React.useCallback(() => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    }, [scale]);

    return (
        <Pressable onPress={onPress} onPressIn={scaleDown} onPressOut={scaleUp}>
            <Animated.View style={[st.createJoin, { transform: [{ scale }] }]}>
                {CirclePlusIcon ? (
                    <CirclePlusIcon size="md" color={createJoinIconColor} />
                ) : (
                    <Text style={st.createJoinFallback}>{"+"}</Text>
                )}
            </Animated.View>
        </Pressable>
    );
}

export default function ServerDrawerSheet({ gestureContext, variant = "grid" }: { gestureContext: any; variant?: "row" | "grid" }) {
    useProxy(storage);

    const pick = React.useCallback((id: string) => {
        Haptic?.triggerHapticFeedback(Haptic.HapticFeedbackTypes.SOFT);
        if (Routing?.transitionToGuild) {
            Routing.transitionToGuild(id, null);
        } else {
            RootNav?.getRootNavigationRef()?.navigate("guilds", { guildId: id });
        }
    }, []);

    const nodes: GuildNode[] = Flux?.useStateFromStores?.(
        [SortedGuildStore],
        () => {
            const t = SortedGuildStore?.getGuildsTree();
            return (t?.root?.children || []).filter((n: GuildNode) => n.type !== "root");
        },
    ) ?? [];

    const gestureCtx = (gestureContext ?? getGestureContext()) as React.Context<any> | null;
    const ctx = React.useContext(gestureCtx ?? FallbackGestureContext) as any;
    const minH = ctx?.minExpandedContentHeight;

    const extCtx = ExternalContext ? React.useContext(ExternalContext) as any : null;
    const setMode = extCtx?.setRestingQuestDockMode;

    // Navigating from an expanded dock leaves the sheet covering the new screen -
    // collapse it first so pushed routes/modals are actually visible.
    const collapseDock = React.useCallback(() => {
        try {
            if (setMode && QuestDockMode?.COLLAPSED != null) setMode(QuestDockMode.COLLAPSED);
        } catch {
            // dock coordination unavailable - navigation still works
        }
    }, [setMode]);

    const openDiscovery = React.useCallback(() => {
        collapseDock();
        // Preferred: the Discovery plugin's own opener (same page as its guilds-bar tile)
        const bridge = (globalThis as any).__discoveryOpenPage;
        if (typeof bridge === "function") {
            bridge();
            return;
        }
        // Fallback: vanilla discovery route through the proven router
        if (Routing?.transitionTo) {
            Haptic?.triggerHapticFeedback?.(Haptic.HapticFeedbackTypes.SOFT);
            Routing.transitionTo("/guild-discovery");
        } else {
            console.log("[ServerDrawer] no discovery opener available");
        }
    }, [collapseDock]);

    const openCreateJoin = React.useCallback(() => {
        Haptic?.triggerHapticFeedback?.(Haptic.HapticFeedbackTypes.SOFT);
        collapseDock();
        CreateGuildMod?.openCreateGuildModal?.();
    }, [collapseDock]);

    const specs = ctx?.questDockWrapperSpecs;

    React.useEffect(() => {
        if (!setMode || !QuestDockMode || !specs) return;
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
            const h = specs.get()?.height ?? 56;
            if (h > 80) {
                setMode(QuestDockMode.COLLAPSED);
                return true;
            }
            return false;
        });
        return () => sub.remove();
    }, [setMode, specs]);

    // The dock mounts its closed and open content together and each normally fades itself out;
    // ours don't, so follow the dock's mode (a shared value React can't subscribe to) by polling.
    const dockMode = useDockMode(ctx?.activeQuestDockMode);
    // Only while expanded: in the closed (tucked) state, and while the card animates back from it,
    // the grid would otherwise show through as an extra row.
    const open = dockMode === (QuestDockMode?.EXPANDED ?? "expanded");

    const separator = storage.folderSeparator !== false;
    const showNames = !!storage.showGuildNames;
    const unreadDms = useUnreadDms();
    const row = variant === "row";
    // Where DMs end and servers begin, and where an open folder's servers end: always marked, as a
    // short line in the row, and a line (or, with the separator setting off, a gap) in the grid.
    const groupEnd: DividerKind = row ? "vertical" : "line";
    const folderEnd: DividerKind = row ? "vertical" : separator ? "line" : "spacer";
    const hasDmGroup = !storage.hideDmTile || unreadDms.length > 0;
    const tiles = (
        <>
            <ReadAllTile />
            {!storage.hideDmTile && <DmTile />}
            {unreadDms.map((id) => <UnreadDmTile key={id} channelId={id} />)}
            {hasDmGroup && <Divider kind={groupEnd} />}
            {nodes.map((node) =>
                node.type === "folder"
                    ? <FolderItem key={node.id} node={node} onPick={pick} showNames={showNames} divider={folderEnd} />
                    : <GuildItem key={node.id} node={node} onPick={pick} showNames={showNames} />
            )}
            <CreateJoinButton onPress={openCreateJoin} />
            {isDiscoveryEnabled() && <DiscoveryTile onPress={openDiscovery} />}
        </>
    );

    // The dock mounts both its closed and open content at once and fades between them, so each
    // variant is its own component: the closed one is a single row that swipes sideways.
    if (variant === "row") {
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.rowScroll} contentContainerStyle={[st.row, { gap: GAP, paddingHorizontal: PAD }]}>
                {tiles}
            </ScrollView>
        );
    }

    // Open: the whole grid, as tall as its content up to a share of the screen so the dock can
    // still be dragged shut and there's room to tap outside it.
    const maxHeight = Math.round(Dimensions.get("window").height * 0.5);
    const onGridLayout = (e: any) => {
        if (!minH) return;
        const h = Math.min(e.nativeEvent.layout.height, maxHeight);
        if (minH.get() !== h) minH.set(h);
    };
    // Kept mounted while the dock is closed so the dock knows how tall to open.
    return (
        <View pointerEvents={open ? "auto" : "none"} collapsable={false}>
            <ScrollView style={{ maxHeight, opacity: open ? 1 : 0 }} showsVerticalScrollIndicator={false}>
                <View style={[st.grid, { paddingHorizontal: PAD, gap: GAP }]} onLayout={onGridLayout}>
                    {tiles}
                </View>
            </ScrollView>
        </View>
    );
}

const st = StyleSheet.create({
    alignTop: {
        flex: 1,
        justifyContent: "flex-start",
        alignItems: "flex-start",
    },
    // The closed dock is a 56pt card that centres its content, so the row needs a size of its own.
    gridHost: {
        flex: 1,
    },
    rowScroll: {
        width: "100%",
        height: "100%",
    },
    row: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingTop: TOP_PAD,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        paddingTop: TOP_PAD,
        paddingBottom: 16,
    },
    createJoin: {
        width: ICON,
        height: ICON,
        borderRadius: RADIUS,
        backgroundColor: createJoinBg,
        alignItems: "center",
        justifyContent: "center",
    },
    discoveryTile: {
        width: ICON,
        height: ICON,
        borderRadius: RADIUS,
        alignItems: "center",
        justifyContent: "center",
    },
    createJoinFallback: {
        color: createJoinIconColor,
        fontSize: 28,
        fontWeight: "700",
        lineHeight: 30,
    },
});
