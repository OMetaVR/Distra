// Expandable Badges: shows every profile badge again, or lets you expand Discord's collapsed badge list in
// place. Port of Distra Desktop's ExpandableBadges.
//
// Discord 348 shows a profile's first MAX_DISPLAYED_PROFILE_BADGES (6) badges in one pill (ProfileBadgeRows)
// followed by "+N", inside a row that wraps (gap 8). The cap is read at render time, so it's lifted while the
// plugin runs, and the ProfileBadgeRows element UserProfilePrimaryInfo renders is replaced by: pills of as many badges as fit across the
// profile, plus a toggle pill ("+N ›" collapsed, "‹" expanded) where Discord had its "+N". The surrounding row
// wraps them onto new lines.

import { cloneElement, isValidElement, useState } from "react";
import { Image, Pressable, useWindowDimensions, View } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath, findByProps } from "@/metro";
import { resolveSemanticColor, semanticColors } from "@/ui/color";
import { Text } from "@/ui/components";

import { definePlugin } from "../types";
import { loadSettings, settings } from "./settings";
import SettingsPage from "./SettingsPage";

const logger = new Logger("ExpandableBadges");
let patcher = createPatcher("ExpandableBadges");

const MARK = "__distraExpandableBadges";
// Discord's pill: 20pt badges 4pt apart, 7pt padding each side; the profile has 16pt margins.
const BADGE = 20;
const GAP = 4;
const PILL_PADDING = 14;
const PROFILE_MARGIN = 32;

let badgeUtils: any;
let stockCap: number | undefined;

function useExpanded(): [boolean, (expanded: boolean) => void] {
    useProxy(settings);
    const [local, setLocal] = useState(false);
    return settings.rememberExpanded ? [settings.expanded, value => void (settings.expanded = value)] : [local, setLocal];
}

function Toggle({ expanded, hidden, style, onPress }: { expanded: boolean; hidden: number; style: any; onPress: () => void }) {
    const color = resolveSemanticColor(semanticColors.TEXT_DEFAULT);
    const label = expanded ? "Show fewer badges" : `Show ${hidden} more badge${hidden === 1 ? "" : "s"}`;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ expanded }}
            hitSlop={6}
            style={[{ borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", gap: 2, minHeight: BADGE + 4 }, style]}
        >
            {expanded ? null : <Text variant="text-md/normal" color="text-default">+{hidden}</Text>}
            <Image
                // Discord has no small left chevron: the right one, flipped.
                source={findAssetId("ChevronSmallRightIcon")}
                style={{ width: 16, height: 16, tintColor: color, transform: expanded ? [{ scaleX: -1 }] : undefined }}
            />
        </Pressable>
    );
}

function chunk<T>(list: T[], size: number) {
    const rows: T[][] = [];
    for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
    return rows;
}

function ExpandableBadgeRows({ Component, props }: { Component: any; props: any }) {
    const [expanded, setExpanded] = useExpanded();
    const window = useWindowDimensions();
    // The width the badges wrap in, measured by an invisible full-width view (until then, a guess).
    const [measured, setMeasured] = useState<number | null>(null);
    const width = measured ?? window.width - PROFILE_MARGIN;
    const badges: any[] = Array.isArray(props.badges) ? props.badges : [];
    const perPill = Math.max(1, Math.floor((width - PILL_PADDING + GAP) / (BADGE + GAP)));
    const collapsedCount = settings.collapsedCount;
    const hidden = badges.length - collapsedCount;
    // A "+1" toggle takes as much room as the badge it hides.
    const toggleable = !settings.alwaysExpand && hidden > 1;
    const shown = toggleable && !expanded ? badges.slice(0, collapsedCount) : badges;

    const pills = chunk(shown, perPill).map((part, index) => (
        <Component key={`pill-${index}`} {...props} badges={part} {...{ [MARK]: true }} />
    ));
    return (
        <>
            <View
                key="measure"
                pointerEvents="none"
                style={{ position: "absolute", left: 0, right: 0, height: 0 }}
                onLayout={event => {
                    const next = Math.floor(event.nativeEvent.layout.width);
                    if (next > 0 && next !== measured) setMeasured(next);
                }}
            />
            {pills}
            {toggleable ? <Toggle key="toggle" expanded={expanded} hidden={hidden} style={props.style} onPress={() => setExpanded(!expanded)} /> : null}
        </>
    );
}

/**
 * Replaces the ProfileBadgeRows element in UserProfilePrimaryInfo's output. Elements may be cached by the
 * React Compiler, so the path down to it is cloned rather than changed.
 */
function replaceRows(node: any, Rows: any, depth = 0): any {
    if (!isValidElement(node) || depth > 8) return node;
    const element = node as any;
    if (element.type === Rows) {
        return element.props?.[MARK] ? element : <ExpandableBadgeRows key={element.key} Component={Rows} props={element.props} />;
    }
    const children = element.props?.children;
    if (children == null) return element;
    if (Array.isArray(children)) {
        let changed = false;
        const next = children.map(child => {
            const replaced = replaceRows(child, Rows, depth + 1);
            changed ||= replaced !== child;
            return replaced;
        });
        return changed ? cloneElement(element, undefined, ...next) : element;
    }
    const replaced = replaceRows(children, Rows, depth + 1);
    return replaced !== children ? cloneElement(element, undefined, replaced) : element;
}

export default definePlugin({
    id: "distra:expandable-badges",
    manifest: {
        name: "Expandable Badges",
        description: "Shows every profile badge again, or lets you expand Discord's collapsed badge list in place.",
        authors: [{ name: "Distra" }, { name: "mmeta (Distra Desktop ExpandableBadges)" }],
        version: "1.0.0",
    },
    async start() {
        await loadSettings();
        badgeUtils = findByProps("MAX_DISPLAYED_PROFILE_BADGES");
        if (typeof badgeUtils?.MAX_DISPLAYED_PROFILE_BADGES !== "number") return logger.warn("Profile badge limit not found");
        // The plugin decides what shows, so Discord's own cutoff and "+N" never kick in.
        const primaryInfo = findByFilePath("modules/user_profile/native/UserProfilePrimaryInfo.tsx");
        const Rows = primaryInfo?.ProfileBadgeRows;
        if (typeof primaryInfo?.default !== "function" || typeof Rows !== "function") return logger.warn("Profile badge rows not found");
        stockCap = badgeUtils.MAX_DISPLAYED_PROFILE_BADGES;
        badgeUtils.MAX_DISPLAYED_PROFILE_BADGES = Number.MAX_SAFE_INTEGER;
        patcher = createPatcher("ExpandableBadges");
        patcher.after("default", primaryInfo, (_args, tree) => replaceRows(tree, Rows));
    },
    stop() {
        patcher.unpatchAll();
        if (badgeUtils && stockCap !== undefined) badgeUtils.MAX_DISPLAYED_PROFILE_BADGES = stockCap;
        stockCap = undefined;
    },
    SettingsComponent: SettingsPage,
});
