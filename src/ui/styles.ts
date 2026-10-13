import { StyleSheet } from "react-native";

import { isSemanticColor, resolveSemanticColor } from "./color";

export { resolveSemanticColor };

/**
 * StyleSheet whose semantic color tokens resolve against the current theme each
 * time a style is read (Vendetta's `createThemedStyleSheet`).
 */
export function createThemedStyleSheet<T extends Record<string, any>>(sheet: T): T {
    for (const key in sheet) {
        sheet[key] = new Proxy(StyleSheet.flatten(sheet[key]) as object, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                return isSemanticColor(value) ? resolveSemanticColor(value) : value;
            },
        }) as T[typeof key];
    }
    return sheet;
}
