// Hooks on element creation by component name (Bunny's `api.react.jsx`):
// `onJsxCreate("ProfileBadge", (Component, element) => newElement)`.
// Reference: examples/Kettu-github/src/lib/api/react/jsx.ts

import { corePatcher } from "@/lib/patcher";
import { byMethods, waitFor } from "@/metro";

type Callback = (Component: any, element: any) => any;

const callbacks = new Map<string, Callback[]>();
let installed = false;

function install() {
    if (installed) return;
    installed = true;
    corePatcher.addCleanup(waitFor(byMethods("jsx", "jsxs"), runtime => {
        const handler = ([Component]: any[], element: any) => {
            // Memo and forwardRef components are objects; the name lives on what they wrap.
            const name = typeof Component === "function"
                ? Component.name || Component.displayName
                : Component?.displayName || Component?.type?.name || Component?.render?.name;
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
