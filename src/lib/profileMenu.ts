// Items in the "..." menu of a user profile (UserProfileOverflowMenu, a native ContextMenu whose
// `items` are groups of { label, action, variant? }). Each caller patches the menu separately, so
// several plugins can add items; the path to the menu is cloned because the React Compiler caches
// the elements it returns.

import type { Patcher } from "@/lib/patcher";
import { findByFilePath } from "@/metro";

export interface ProfileMenuItem {
    label: string;
    action: () => void;
    variant?: "destructive" | "default";
}

const FILE = "modules/user_profile/native/UserProfileOverflowMenu.tsx";

/** Returns `node` with the first element matching `predicate` replaced by `replace(element)`, cloning its ancestors. */
function replaceElement(node: any, predicate: (node: any) => boolean, replace: (node: any) => any, depth = 0): any {
    if (!node || typeof node !== "object" || depth > 30) return node;
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            const next = replaceElement(node[i], predicate, replace, depth + 1);
            if (next !== node[i]) return [...node.slice(0, i), next, ...node.slice(i + 1)];
        }
        return node;
    }
    if (predicate(node)) return replace(node);
    const children = node.props?.children;
    if (children == null || typeof children !== "object") return node;
    const next = replaceElement(children, predicate, replace, depth + 1);
    return next === children ? node : { ...node, props: { ...node.props, children: next } };
}

const isMenu = (node: any) => Array.isArray(node?.props?.items) && node.props.items.every(Array.isArray);

/**
 * Adds items to the first group of profile "..." menus. `getItems` gets the menu's props
 * ({ user, currentUser, channel?, ... }) and returns the items to add (or nothing).
 */
export function addProfileMenuItems(patcher: Patcher, getItems: (props: any) => ProfileMenuItem[] | null | undefined): boolean {
    const module = findByFilePath(FILE);
    if (typeof module?.default !== "function") return false;
    patcher.after("default", module, ([props]: any[], tree: any) => {
        const items = getItems(props);
        if (!items?.length) return;
        return replaceElement(tree, isMenu, menu => {
            const [first = [], ...rest] = menu.props.items;
            return { ...menu, props: { ...menu.props, items: [[...first, ...items], ...rest] } };
        });
    });
    return true;
}
