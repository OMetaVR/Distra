// Long-press menu of logged messages: deleted ones lose their delete actions (Discord's
// "Delete Message" and plugin rows like SilentDelete's), and every logged message gets
// "Remove from Log" in their place.

import type { Patcher } from "@/lib/patcher";
import { Logger } from "@/lib/logger";
import { findByProps } from "@/metro";
import { React } from "@/metro/common";

import { forgetMessage } from "./capture";
import { isDeleted, logged } from "./state";

const logger = new Logger("MessageLogger");

let TrashIcon: unknown;

function isDeleteRow(element: any) {
    const props = element?.props;
    if (!props) return false;
    TrashIcon ??= findByProps("TrashIcon")?.TrashIcon;
    if (TrashIcon && props.icon?.props?.IconComponent === TrashIcon) return true;
    // Plugin rows ("Silent Delete") use asset icons; their labels are English.
    return (props.variant === "danger" || props.destructive) && typeof props.label === "string" && /delete/i.test(props.label);
}

const isEmptyGroup = (element: any) =>
    element?.props && "hasIcons" in element.props && Array.isArray(element.props.children) && !element.props.children.some(Boolean);

/** Removes delete rows (and groups left empty) from a rendered sheet, in place. */
function prune(node: any, depth = 0) {
    if (!node || typeof node !== "object" || depth > 20) return;
    if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) {
            prune(node[i], depth + 1);
            if (isDeleteRow(node[i]) || isEmptyGroup(node[i])) node.splice(i, 1);
        }
        return;
    }
    prune(node.props?.children, depth + 1);
}

const isGroup = (element: any) => element?.props && "hasIcons" in element.props;

/** The array holding the sheet's row groups, and one of Discord's rows to take the element types from. */
function findGroups(node: any, depth = 0): { groups: any[]; row: any } | undefined {
    if (!node || typeof node !== "object" || depth > 20) return;
    if (Array.isArray(node)) {
        const group = node.find(isGroup);
        const rows = group?.props.children;
        const row = (Array.isArray(rows) ? rows : [rows]).find((r: any) => r?.props?.icon?.props?.IconComponent);
        if (row) return { groups: node, row };
        for (const child of node) {
            const found = findGroups(child, depth + 1);
            if (found) return found;
        }
        return;
    }
    return findGroups(node.props?.children, depth + 1);
}

function removeFromLogRow(row: any, message: any, hide: () => void) {
    TrashIcon ??= findByProps("TrashIcon")?.TrashIcon;
    return React.createElement(row.type, {
        key: "distra-remove-from-log",
        label: "Remove from Log",
        variant: "danger",
        icon: React.createElement(row.props.icon.type, { IconComponent: TrashIcon ?? row.props.icon.props.IconComponent }),
        onPress: () => {
            hide();
            forgetMessage(message.channel_id, message.id, true);
        },
    });
}

/**
 * Renders the sheet with the rows changed. This runs at render time rather than in the
 * patch so other plugins' patches have added their rows by then.
 */
function LoggedMessageSheet({ children, message, hide }: { children?: any; message: any; hide: () => void }) {
    if (isDeleted(message.id)) prune(children);
    const found = findGroups(children);
    if (found) {
        const groupType = found.groups.find(isGroup).type;
        found.groups.push(React.createElement(groupType, { key: "distra-logger", hasIcons: true }, removeFromLogRow(found.row, message, hide)));
    }
    return children;
}

export function patchMessageActions(patcher: Patcher) {
    const ActionSheet = findByProps("openLazy", "hideActionSheet");
    if (!ActionSheet) return logger.warn("Action sheet module not found; the message menu is unchanged");
    const hide = () => ActionSheet.hideActionSheet();
    const patched = new WeakSet<object>();
    patcher.before("openLazy", ActionSheet, ([component, key]: any[]) => {
        if (key !== "MessageLongPressActionSheet" || typeof component?.then !== "function") return;
        // Registered before Discord's own `then`, so the sheet renders through the patch.
        component.then((module: any) => {
            if (!module || patched.has(module)) return;
            patched.add(module);
            patcher.after("default", module, ([props]: any[], tree: any) => {
                const message = props?.message;
                if (!message?.id || !logged.has(message.id) || !tree) return;
                return React.createElement(LoggedMessageSheet, { message, hide }, tree);
            });
        });
    });
}
