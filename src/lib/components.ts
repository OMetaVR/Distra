// Patching Discord components by source file. Discord minifies component names, so
// components are located through their module's file path and patched where their
// render function actually lives (plain function, memo().type, forwardRef().render).

import type { Patcher } from "@/lib/patcher";
import { findByFilePath } from "@/metro";

type AfterRender = (props: any, element: any) => any;
type BeforeRender = (props: any) => any;

/** Where a component's render function lives: [object, key]. */
function renderTarget(path: string): [any, string] | undefined {
    const exports = findByFilePath(path);
    const component = exports?.default;
    if (!component) return undefined;
    // Class components render through their prototype.
    if (typeof component === "function" && typeof component.prototype?.render === "function") return [component.prototype, "render"];
    if (typeof component === "function") return [exports, "default"];
    // memo(Component), memo(forwardRef(Component)), forwardRef(Component)
    if (typeof component.type === "function") return [component, "type"];
    if (typeof component.type?.render === "function") return [component.type, "render"];
    if (typeof component.render === "function") return [component, "render"];
    return undefined;
}

/** Patches the default-exported component of `path` to post-process its rendered element. */
export function afterComponentRender(patcher: Patcher, path: string, callback: AfterRender): boolean {
    const target = renderTarget(path);
    if (!target) return false;
    patcher.after(target[1], target[0], ([props]: any[], element: any) => element == null ? element : callback(props, element) ?? element);
    return true;
}

/** Patches the default-exported component of `path` to rewrite its props (return new props, or nothing). */
export function beforeComponentRender(patcher: Patcher, path: string, callback: BeforeRender): boolean {
    const target = renderTarget(path);
    if (!target) return false;
    patcher.before(target[1], target[0], (args: any[]) => {
        const props = callback(args[0]);
        if (props !== undefined) return [props, ...args.slice(1)];
    });
    return true;
}

/** Calls `visit` on every element in a rendered tree (props.children only). */
export function forEachElement(element: any, visit: (node: any) => void, depth = 0) {
    if (!element || typeof element !== "object" || depth > 40) return;
    if (Array.isArray(element)) {
        for (const child of element) forEachElement(child, visit, depth + 1);
        return;
    }
    visit(element);
    forEachElement(element.props?.children, visit, depth + 1);
}

/** Depth-first search through a rendered element's props/children. */
export function findElement(element: any, predicate: (node: any) => boolean, depth = 0): any {
    if (!element || typeof element !== "object" || depth > 40) return undefined;
    if (Array.isArray(element)) {
        for (const child of element) {
            const found = findElement(child, predicate, depth + 1);
            if (found) return found;
        }
        return undefined;
    }
    if (predicate(element)) return element;
    return findElement(element.props?.children, predicate, depth + 1);
}

/** Text content of an element's direct children, if it only contains text. */
export function textOf(element: any): string | undefined {
    const children = element?.props?.children;
    if (typeof children === "string") return children;
    if (Array.isArray(children) && children.every(c => typeof c === "string" || typeof c === "number")) return children.join("");
    return undefined;
}
