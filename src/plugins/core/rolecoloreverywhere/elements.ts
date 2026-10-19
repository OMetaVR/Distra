import { cloneElement } from "react";

/** Where a component's render function lives: [object, key] (plain function, memo, forwardRef, class). */
export function renderTargetOf(component: any): [any, string] | undefined {
    if (!component) return undefined;
    if (typeof component === "function" && typeof component.prototype?.render === "function") return [component.prototype, "render"];
    if (typeof component.type === "function") return [component, "type"];
    if (typeof component.type?.render === "function") return [component.type, "render"];
    if (typeof component.render === "function") return [component, "render"];
    return undefined;
}

/**
 * Replaces the first element matching `predicate` in a rendered tree. Elements on the way are
 * cloned (React Compiler caches elements, so they must not be mutated).
 */
export function replaceElement(element: any, predicate: (node: any) => boolean, replace: (node: any) => any, depth = 0): any {
    if (!element || typeof element !== "object" || depth > 30) return element;
    if (Array.isArray(element)) {
        let done = false;
        const out = element.map(child => {
            if (done) return child;
            const next = replaceElement(child, predicate, replace, depth + 1);
            if (next !== child) done = true;
            return next;
        });
        return done ? out : element;
    }
    if (!element.props) return element;
    if (predicate(element)) return replace(element);
    const children = element.props.children;
    if (children == null || typeof children !== "object") return element;
    const next = replaceElement(children, predicate, replace, depth + 1);
    return next === children ? element : cloneElement(element, { children: next });
}

/** Adds a text color to an element's style. */
export const withColor = (element: any, color: string) => cloneElement(element, { style: [element.props.style, { color }] });
