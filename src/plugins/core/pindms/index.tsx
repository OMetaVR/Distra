// Pin DMs: pin DMs into collapsible, coloured categories at the top of the DM list. Port of
// Vencord/Equicord's PinDMs (GPL-3.0-or-later, by Vendicated, Aria and contributors) for mobile:
//
//   - the DM list is Discord's Messages list (MessagesFastestList), a sectioned FastestList driven by callbacks
//     (renderItem(section, row), itemSize(section), keyExtractor(type, section, row), ...). Each
//     category becomes a section in front of Discord's own, rendered with Discord's own DM row; the
//     pinned DMs leave Discord's section, and every callback for Discord's sections is passed through
//     with the section (and row) shifted back;
//   - "Pin DM" sits at the top of a DM's long-press menu (the desktop plugin's context menu).

import { useEffect, useReducer } from "react";
import { Image, Pressable, View } from "react-native";

import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath, findByProps, findByStoreName } from "@/metro";
import { resolveSemanticColor, semanticColors } from "@/ui/color";
import { Text } from "@/ui/components";

import { definePlugin } from "../types";
import * as pins from "./data";
import { categories, categoryOf, channelsOf, onPinsChanged, setCollapsed, setDmSectionCollapsed } from "./data";
import { hex, loadSettings, settings } from "./settings";
import SettingsPage from "./SettingsPage";
import { openCategoryActions, openPinSheet } from "./sheets";

const logger = new Logger("PinDMs");
let patcher = createPatcher("PinDMs");

const LIST_ID = "dm-messages-list";
/** Discord's sections in the Messages list: [FavoriteChannels, Channels, Separator, SuggestedFriends, Placeholders]. */
const DISCORD_CHANNELS = 1;
const ITEM = 0;
const HEADER_HEIGHT = 36;
/** Height of the fade at the bottom of a section header (inside HEADER_HEIGHT, so layout is unchanged). */
const FADE_HEIGHT = 12;
const TRANSFORMED = Symbol.for("distra.pinDms");

const ReadStateStore = findByStoreName("ReadStateStore");
const SelectedChannelStore = findByStoreName("SelectedChannelStore");
const ThemeStore = findByStoreName("ThemeStore");
const LinearGradient = () => findByProps("LinearGradient", "LinearGradientNativeComponent")?.LinearGradient;

const ChannelRow = () => findByFilePath("modules/main_tabs_v2/native/tabs/messages/items/MessagesItemChannel.tsx")?.MessagesItemChannelFast;

function useStoreUpdates(store: any) {
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => {
        if (!store?.addChangeListener) return;
        store.addChangeListener(rerender);
        return () => store.removeChangeListener(rerender);
    }, [store]);
}

/** The same colour with zero alpha, so the fade doesn't pass through a darker or lighter transparent. */
function transparentOf(color: string): string {
    if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}00`;
    if (/^#[0-9a-f]{8}$/i.test(color)) return `${color.slice(0, 7)}00`;
    return "transparent";
}

/**
 * Solid backdrop in the DM list's colour (the panel background) with a short fade on its bottom edge.
 * The list sticks section headers to the top while scrolling, and rows would otherwise show through.
 * Not stuck, it matches what's behind it and is invisible.
 */
function HeaderBackdrop() {
    useStoreUpdates(ThemeStore);
    const color = resolveSemanticColor(semanticColors.PANEL_BG) ?? "transparent";
    const Gradient = LinearGradient();
    return (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
            <View style={{ flex: 1, backgroundColor: color }} />
            {Gradient ? (
                <Gradient
                    pointerEvents="none"
                    colors={[color, transparentOf(color)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ height: FADE_HEIGHT }}
                />
            ) : <View style={{ height: FADE_HEIGHT, backgroundColor: color, opacity: 0.5 }} />}
        </View>
    );
}

function SectionHeader({ label, color, collapsed, collapsible, count, onPress, onLongPress }: {
    label: string;
    color?: string;
    collapsed: boolean;
    collapsible: boolean;
    count?: number;
    onPress?: () => void;
    onLongPress?: () => void;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}${collapsible ? (collapsed ? ", collapsed" : ", expanded") : ""}`}
            onPress={collapsible ? onPress : undefined}
            onLongPress={onLongPress}
            style={{ height: HEADER_HEIGHT, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 6 }}
        >
            <HeaderBackdrop />
            {collapsible ? (
                <View style={{ transform: [{ rotate: collapsed ? "-90deg" : "0deg" }] }}>
                    <TableIcon name="ChevronSmallDownIcon" tint={color} />
                </View>
            ) : null}
            <Text variant="text-xs/bold" color={color ? undefined : "text-muted"} style={[{ textTransform: "uppercase", letterSpacing: 0.4 }, color ? { color } : null]}>
                {label}
            </Text>
            {count != null ? <Text variant="text-xs/medium" color="text-muted">{`· ${count}`}</Text> : null}
        </Pressable>
    );
}

function TableIcon({ name, tint }: { name: string; tint?: string }) {
    return <Image source={findAssetId(name)} style={{ width: 16, height: 16, tintColor: tint ?? "#949ba4" }} />;
}

interface Pinned {
    id: string;
    name: string;
    color: string;
    collapsed: boolean;
    channels: string[];
    total: number;
}

/** Builds the list's props with the categories in front of Discord's sections. */
function transform(props: any): any {
    const sections: number[] = props.sections;
    const keyOf = props.keyExtractor;
    if (!Array.isArray(sections) || typeof keyOf !== "function" || typeof props.renderItem !== "function") return props;

    const list = categories();
    if (!list.length) return props;

    // DMs Discord would show, by section, so pins only include open DMs.
    const present = new Set<string>();
    for (let section = 0; section <= DISCORD_CHANNELS; section++) {
        for (let row = 0; row < (sections[section] ?? 0); row++) {
            const id = keyOf(ITEM, section, row);
            if (typeof id === "string") present.add(id);
        }
    }
    const selected = SelectedChannelStore?.getChannelId?.();

    const pinned: Pinned[] = list.map(category => {
        const open = channelsOf(category).filter(id => present.has(id));
        // A collapsed category still shows DMs with unread messages and the one you're in.
        const visible = category.collapsed ? open.filter(id => id === selected || ReadStateStore?.hasUnread?.(id)) : open;
        return { id: category.id, name: category.name, color: hex(category.color), collapsed: !!category.collapsed, channels: visible, total: open.length };
    });

    // Discord's channel rows without the pinned ones (keeping their original row numbers).
    const rows: number[] = [];
    for (let row = 0; row < (sections[DISCORD_CHANNELS] ?? 0); row++) {
        const id = keyOf(ITEM, DISCORD_CHANNELS, row);
        if (typeof id !== "string" || !categoryOf(id)) rows.push(row);
    }
    const dmCollapsed = settings.canCollapseDmSection && settings.dmSectionCollapsed;

    // The list leaves out sections without rows, header and all, so an empty one (a collapsed or
    // empty category, or collapsed Direct Messages) gets a single invisible row to keep its header.
    const n = pinned.length;
    const shifted = sections.slice();
    const dmSpacer = dmCollapsed || rows.length === 0;
    shifted[DISCORD_CHANNELS] = dmSpacer ? 1 : rows.length;
    const nextSections = [...pinned.map(category => category.channels.length || 1), ...shifted];
    const spacer = (section: number) => section < n ? pinned[section].channels.length === 0 : section - n === DISCORD_CHANNELS && dmSpacer;

    const own = (section: number) => section < n ? pinned[section] : undefined;
    const theirs = (section: number) => section - n;
    const theirRow = (section: number, row: number) => section === DISCORD_CHANNELS ? rows[row] ?? row : row;
    const rowHeight = props.itemSize(DISCORD_CHANNELS);

    return {
        ...props,
        [TRANSFORMED]: true,
        sections: nextSections,
        itemSize: (section: number) => spacer(section) ? 0 : own(section) ? rowHeight : props.itemSize(theirs(section)),
        keyExtractor: (type: number, section: number, row: number) => {
            const category = own(section);
            if (spacer(section) && type === ITEM) return `pin-spacer:${category?.id ?? "dms"}`;
            if (category) return type === ITEM ? `pin:${category.channels[row]}` : `pin-header:${category.id}`;
            return keyOf(type, theirs(section), theirRow(theirs(section), row));
        },
        renderItem: (section: number, row: number) => {
            if (spacer(section)) return <View style={{ height: 0 }} />;
            const category = own(section);
            if (!category) return props.renderItem(theirs(section), theirRow(theirs(section), row));
            const Row = ChannelRow();
            return Row ? <Row channelId={category.channels[row]} placeholderHeight={rowHeight} row={row} /> : null;
        },
        sectionHeaderSize: (section: number) => {
            if (own(section)) return HEADER_HEIGHT;
            const theirSection = theirs(section);
            return theirSection === DISCORD_CHANNELS ? HEADER_HEIGHT : props.sectionHeaderSize?.(theirSection) ?? 0;
        },
        renderSectionHeader: (section: number, ...rest: any[]) => {
            const category = own(section);
            if (category) {
                return (
                    <SectionHeader
                        label={category.name}
                        color={category.color}
                        collapsed={category.collapsed}
                        collapsible
                        count={category.collapsed ? category.total : undefined}
                        onPress={() => setCollapsed(category.id, !category.collapsed)}
                        onLongPress={() => openCategoryActions(category.id)}
                    />
                );
            }
            const theirSection = theirs(section);
            if (theirSection === DISCORD_CHANNELS) {
                return (
                    <SectionHeader
                        label="Direct Messages"
                        collapsed={dmCollapsed}
                        collapsible={settings.canCollapseDmSection}
                        onPress={() => setDmSectionCollapsed(!settings.dmSectionCollapsed)}
                    />
                );
            }
            return props.renderSectionHeader?.(theirSection, ...rest) ?? null;
        },
    };
}

/** Renders the Messages list with the pinned categories, re-rendering when pins or unreads change. */
function PinnedList({ Component, listProps }: { Component: any; listProps: any }) {
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => onPinsChanged(rerender), []);
    useStoreUpdates(ReadStateStore);
    useStoreUpdates(SelectedChannelStore);
    let next = listProps;
    try {
        next = transform(listProps);
    } catch (e) {
        logger.error("Couldn't add pinned DMs to the list", e);
    }
    return <Component {...next} />;
}

/** Swaps the Messages list element (in what MessagesFastestList renders) for PinnedList. */
function wrapList(node: any, depth = 0): any {
    if (!node || typeof node !== "object" || depth > 8) return node;
    if (node.props?.listId === LIST_ID && !node.props[TRANSFORMED]) {
        return <PinnedList key={node.key ?? undefined} Component={node.type} listProps={{ ...node.props, [TRANSFORMED]: true }} />;
    }
    const children = node.props?.children;
    if (Array.isArray(children)) {
        const next = children.map(child => wrapList(child, depth + 1));
        if (next.some((child, i) => child !== children[i])) return { ...node, props: { ...node.props, children: next } };
    } else if (children && typeof children === "object") {
        const next = wrapList(children, depth + 1);
        if (next !== children) return { ...node, props: { ...node.props, children: next } };
    }
    return node;
}

function patchList() {
    const list = findByFilePath("modules/main_tabs_v2/native/tabs/messages/MessagesFastestList.tsx")?.default;
    const target = list?.type?.render ? list.type : list?.render ? list : undefined;
    if (!target) return logger.warn("DM list not found; pinned DMs won't show in it");
    patcher.after("render", target, (_, ret) => wrapList(ret));
}

/** "Pin DM" at the top of a DM's (or group DM's) long-press menu. */
function patchLongPressMenu() {
    const Sheet = findByFilePath("modules/channel/native/ChannelLongPressActionSheet.tsx", false);
    const { ActionSheetRow } = findByProps("ActionSheetRow") ?? {};
    if (!Sheet?.default || !ActionSheetRow) return logger.warn("Channel long-press menu not found; pin DMs from the plugin's settings");
    const PATCHED = Symbol.for("distra.pinDms.sheet");

    patcher.after("default", Sheet, (_, ret) => {
        const channel = ret?.props?.channel;
        if (!channel || ret[PATCHED] || (channel.type !== 1 && channel.type !== 3)) return;
        ret[PATCHED] = true;
        patcher.after("type", ret, (__, tree) => {
            const groups = findGroups(tree);
            if (!groups) return;
            const current = categoryOf(channel.id);
            groups.unshift(
                <ActionSheetRow.Group key="distra-pin-dms">
                    <ActionSheetRow
                        label={current ? `Pinned in ${current.name}` : "Pin DM"}
                        icon={<ActionSheetRow.Icon source={findAssetId("PinIcon")} />}
                        onPress={() => {
                            findByProps("openLazy", "hideActionSheet")?.hideActionSheet?.();
                            setTimeout(() => openPinSheet(channel.id), 350);
                        }}
                    />
                </ActionSheetRow.Group>,
            );
        });
    });
}

function findGroups(tree: any, depth = 0): any[] | undefined {
    if (!tree || typeof tree !== "object" || depth > 25) return undefined;
    if (Array.isArray(tree)) {
        if (tree[0]?.props?.children?.find?.((child: any) => child?.props?.label)) return tree;
        for (const node of tree) {
            const found = findGroups(node, depth + 1);
            if (found) return found;
        }
        return undefined;
    }
    return findGroups(tree.props?.children, depth + 1);
}

export default definePlugin({
    id: "distra:pin-dms",
    manifest: {
        name: "Pin DMs",
        description: "Pin DMs into collapsible, coloured categories at the top of your DM list. Hold a DM and choose Pin DM.",
        authors: [{ name: "Distra" }, { name: "Vendicated, Aria (Vencord/Equicord PinDMs)" }],
        version: "1.0.0",
    },
    async start() {
        await loadSettings();
        patcher = createPatcher("PinDMs");
        try {
            patchList();
        } catch (e) {
            logger.error("Couldn't patch the DM list", e);
        }
        try {
            patchLongPressMenu();
        } catch (e) {
            logger.error("Couldn't add Pin DM to the long-press menu", e);
        }
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
    api: pins,
});
