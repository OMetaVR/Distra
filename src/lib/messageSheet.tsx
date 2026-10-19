// Rows that core plugins add to the message long-press menu (MessageLongPressActionSheet). Every
// provider's rows go into one group at the end of the sheet, so plugins that each add a row
// (Hide Messages, Download All Attachments, ...) share one patch and one group.
//
// The sheet is opened with `openLazy(import(...), "MessageLongPressActionSheet", props)`; the patch
// hooks the lazy module as it resolves (before Discord's own `then`, like Message Logger does) and
// rebuilds the rendered tree with the group added, without mutating Discord's elements.

import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher, type Patcher } from "@/lib/patcher";
import { findByProps } from "@/metro";
import { React } from "@/metro/common";

const logger = new Logger("MessageSheet");

export interface MessageSheetRow {
    key: string;
    label: string;
    /** Icon asset name (findAssetId) or id. */
    icon: string | number;
    variant?: "danger";
    /** Runs after the sheet has been closed. */
    onPress(): void;
}

export type MessageSheetProvider = (message: any, props: any) => MessageSheetRow[] | MessageSheetRow | null | undefined | false;

const providers = new Set<MessageSheetProvider>();
let patcher: Patcher | undefined;

const SHEET_KEY = "MessageLongPressActionSheet";
const GROUP_KEY = "distra-message-sheet";

const sheets = () => findByProps("openLazy", "hideActionSheet");

/** Closes the open action sheet. */
export const hideActionSheet = () => sheets()?.hideActionSheet?.();

const isGroup = (element: any) => element?.props && typeof element.props === "object" && "hasIcons" in element.props;

/** `tree` with `group` appended to the array holding the sheet's row groups, or undefined if there is none. */
function withGroup(tree: any, group: any, depth = 0): any {
    if (!tree || typeof tree !== "object" || depth > 20) return undefined;
    if (Array.isArray(tree)) {
        if (tree.some(isGroup)) return tree.some(child => child?.key === GROUP_KEY) ? tree : [...tree, group];
        for (let i = 0; i < tree.length; i++) {
            const next = withGroup(tree[i], group, depth + 1);
            if (next) return Object.assign(tree.slice(), { [i]: next });
        }
        return undefined;
    }
    const children = tree.props?.children;
    if (children == null) return undefined;
    const next = withGroup(children, group, depth + 1);
    return next ? { ...tree, props: { ...tree.props, children: next } } : undefined;
}

function renderRows(message: any, props: any) {
    const rows: MessageSheetRow[] = [];
    for (const provider of providers) {
        try {
            const result = provider(message, props);
            if (result) rows.push(...(Array.isArray(result) ? result : [result]));
        } catch (e) {
            logger.error("A message menu provider threw", e);
        }
    }
    return rows;
}

function buildGroup(rows: MessageSheetRow[]) {
    const { ActionSheetRow } = findByProps("ActionSheetRow") ?? {};
    if (!ActionSheetRow?.Group) return undefined;
    return React.createElement(ActionSheetRow.Group, { key: GROUP_KEY }, rows.map(row => React.createElement(ActionSheetRow, {
        key: row.key,
        label: row.label,
        variant: row.variant,
        icon: React.createElement(ActionSheetRow.Icon, { source: typeof row.icon === "number" ? row.icon : findAssetId(row.icon) }),
        onPress: () => {
            hideActionSheet();
            try {
                row.onPress();
            } catch (e) {
                logger.error(`Message menu row "${row.label}" threw`, e);
            }
        },
    })));
}

function install() {
    const ActionSheets = sheets();
    if (!ActionSheets) return logger.warn("Action sheet module not found; message menu rows won't show");
    patcher = createPatcher("MessageSheet");
    const patched = new WeakSet<object>();
    patcher.before("openLazy", ActionSheets, ([component, key]: any[]) => {
        if (key !== SHEET_KEY || typeof component?.then !== "function") return;
        component.then((module: any) => {
            if (!module || typeof module.default !== "function" || patched.has(module) || !patcher) return;
            patched.add(module);
            patcher.after("default", module, ([props]: any[], tree: any) => {
                const message = props?.message;
                if (!message?.id || !tree || !providers.size) return;
                const rows = renderRows(message, props);
                if (!rows.length) return;
                const group = buildGroup(rows);
                return group ? withGroup(tree, group) ?? tree : tree;
            });
        });
    });
}

/** Adds rows to the message long-press menu. Returns a function that removes them. */
export function addMessageSheetRows(provider: MessageSheetProvider) {
    providers.add(provider);
    if (!patcher) install();
    return () => {
        providers.delete(provider);
        if (!providers.size && patcher) {
            patcher.unpatchAll();
            patcher = undefined;
        }
    };
}
