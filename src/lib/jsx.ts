// Hooks on element creation by component name (Bunny's `api.react.jsx`):
// `onJsxCreate("ProfileBadge", (Component, element) => newElement)`.
// Reference: examples/Kettu-github/src/lib/api/react/jsx.ts

import { corePatcher } from "@/lib/patcher";
import { byMethods, waitFor } from "@/metro";

type Callback = (Component: any, element: any) => any;

const callbacks = new Map<string, Callback[]>();

/** Component -> its name, resolved once per component type. */
const names = new WeakMap<object, string>();
function nameOf(Component: any): string {
    if (typeof Component !== "function" && typeof Component !== "object") return "";
    let name: string | undefined = names.get(Component);
    if (name === undefined) {
        // Memo and forwardRef components are objects; the name lives on what they wrap.
        name = (typeof Component === "function"
            ? Component.name || Component.displayName
            : Component.displayName || Component.type?.name || Component.render?.name) || "";
        names.set(Component, name as string);
    }
    return name as string;
}
let installed = false;

function install() {
    if (installed) return;
    installed = true;
    corePatcher.addCleanup(waitFor(byMethods("jsx", "jsxs"), runtime => {
        const handler = ([Component]: any[], element: any) => {
            // Runs for every element Discord creates, so bail out as early as possible.
            if (callbacks.size === 0 || Component == null || typeof Component === "string") return;
            const name = nameOf(Component);
            if (!name) return;
            const list = callbacks.get(name);
            if (!list) return;
            for (const callback of list) {
                const result = callback(Component, element);
                if (result !== undefined) element = result;
            }
            return element;
        };
        corePatcher.after("jsx", runtime, handler);
        corePatcher.after("jsxs", runtime, handler);
    }));
}

export function onJsxCreate(componentName: string, callback: Callback) {
    install();
    callbacks.set(componentName, [...callbacks.get(componentName) ?? [], callback]);
}

export function deleteJsxCreate(componentName: string, callback: Callback) {
    const list = callbacks.get(componentName)?.filter(cb => cb !== callback) ?? [];
    if (list.length) callbacks.set(componentName, list);
    else callbacks.delete(componentName);
}
