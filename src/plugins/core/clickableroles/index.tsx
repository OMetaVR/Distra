// Clickable Roles: tap a role in a member's profile, or a role mention in chat, for a sheet with the role's
// colour and id (tap to copy) and the members you have loaded who have it. Mobile take on Equicord's InRole
// (GPL-3.0-or-later, by nin0dev) and BetterRoleContext (by Ven, goodbee):
//
//   - profile roles are UserProfileRolesCard's RoleItems (rendered by an inner list component); the card's
//     output gets a wrapper per role that renders the RoleItem and points its press (Discord's "copy role ID")
//     at the sheet, which has the copy too; the long press is left alone;
//   - tapping a role mention opens Discord's RoleMembersActionSheet through openLazy; the role sheet opens
//     instead and links to Discord's list ("View all members").

import { cloneElement, isValidElement } from "react";
import { Pressable } from "react-native";

import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath, findByProps } from "@/metro";

import { definePlugin } from "../types";
import { DIRECT, openRoleSheet } from "./RoleSheet";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";

const logger = new Logger("ClickableRoles");
let patcher = createPatcher("ClickableRoles");

/** Gives the first pressable in a rendered tree `onPress`; wraps the tree in one if there is none. */
function withPress(tree: any, onPress: () => void, label?: string): any {
    const press = (node: any, depth: number): any => {
        if (!isValidElement(node) || depth > 6) return undefined;
        const props: any = node.props;
        if (typeof props.onPress === "function" || typeof props.onLongPress === "function" || props.accessibilityRole === "button") {
            return cloneElement(node as any, { onPress, accessibilityRole: "button", accessibilityHint: "Shows the role's details" } as any);
        }
        const { children } = props;
        if (Array.isArray(children)) {
            for (let i = 0; i < children.length; i++) {
                const next = press(children[i], depth + 1);
                if (next) return cloneElement(node as any, undefined, ...children.map((child: any, j: number) => j === i ? next : child));
            }
        } else if (children) {
            const next = press(children, depth + 1);
            if (next) return cloneElement(node as any, undefined, next);
        }
        return undefined;
    };
    return press(tree, 0) ?? (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>{tree}</Pressable>
    );
}

/** Renders Discord's RoleItem (as a function, so its output can be adjusted) with its press opening the sheet. */
function ClickableRoleItem({ RoleItem, roleProps }: { RoleItem: (props: any) => any; roleProps: any }) {
    const tree = RoleItem(roleProps);
    const roleId = roleProps?.role?.id;
    const guildId = roleProps?.guildId;
    if (!roleId || !guildId || !settings.profileRoles) return tree;
    return withPress(tree, () => openRoleSheet({ guildId, roleId }), roleProps.role.name);
}

/** Renders the card's role list component (as a function) with its RoleItems swapped. */
function RoleList({ List, listProps, RoleItem }: { List: (props: any) => any; listProps: any; RoleItem: any }) {
    return swapRoleItems(List(listProps), RoleItem);
}

function swapRoleItems(node: any, RoleItem: any, depth = 0): any {
    if (!node || typeof node !== "object" || depth > 10) return node;
    if (Array.isArray(node)) {
        const next = node.map(child => swapRoleItems(child, RoleItem, depth + 1));
        return next.some((child, i) => child !== node[i]) ? next : node;
    }
    if (node.type === RoleItem) {
        return <ClickableRoleItem key={node.key ?? undefined} RoleItem={RoleItem} roleProps={node.props} />;
    }
    // The card renders its RoleItems from an inner list component (props: guildId, guildMemberRoleIds).
    if (typeof node.type === "function" && Array.isArray(node.props?.guildMemberRoleIds)) {
        return <RoleList key={node.key ?? undefined} List={node.type} listProps={node.props} RoleItem={RoleItem} />;
    }
    const children = node.props?.children;
    if (children == null || typeof children !== "object") return node;
    const next = swapRoleItems(children, RoleItem, depth + 1);
    return next === children ? node : { ...node, props: { ...node.props, children: next } };
}

function patchProfileRoles() {
    const card = findByFilePath("modules/user_profile/native/UserProfileRolesCard.tsx");
    const RoleItem = card?.RoleItem;
    if (typeof card?.default !== "function" || typeof RoleItem !== "function") {
        return logger.warn("Profile roles card not found; profile roles won't be clickable");
    }
    patcher.after("default", card, (_, tree) => settings.profileRoles ? swapRoleItems(tree, RoleItem) : tree);
}

function patchRoleMentions() {
    const sheets = findByProps("openLazy", "hideActionSheet");
    if (!sheets?.openLazy) return logger.warn("Action sheets not found; role mentions keep Discord's member list");
    patcher.instead("openLazy", sheets, (args, original) => {
        const [, key, props] = args;
        if (key !== "RoleMembersActionSheet" || !settings.roleMentions || !props?.guildId || !props?.roleId || props[DIRECT]) return original(...args);
        openRoleSheet({ ...props, showAll: () => original(...args) });
    });
}

export default definePlugin({
    id: "distra:clickable-roles",
    manifest: {
        name: "Clickable Roles",
        description: "Tap a role in a profile or a role mention to see its colour and id (tap to copy) and who has it.",
        authors: [{ name: "Distra" }, { name: "nin0dev (Equicord InRole)" }, { name: "Ven, goodbee (BetterRoleContext)" }],
        version: "1.0.0",
    },
    async start() {
        await loadSettings();
        patcher = createPatcher("ClickableRoles");
        for (const [what, patch] of [["profile roles", patchProfileRoles], ["role mentions", patchRoleMentions]] as const) {
            try {
                patch();
            } catch (e) {
                logger.error(`Couldn't patch ${what}`, e);
            }
        }
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
});
