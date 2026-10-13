// Replaces "react/jsx-runtime". Components found through lazy Metro proxies are
// unwrapped first, since React rejects proxies as element types.
import { unwrapLazy } from "@/lib/lazy";
import { findByPropsLazy } from "@/metro";

const runtime = findByPropsLazy("jsx", "jsxs", "Fragment");

function unwrapType(args: any[]) {
    if (args[0] == null) throw new Error("JSX element type is null or undefined");
    args[0] = unwrapLazy(args[0]);
    return args;
}

export const Fragment = Symbol.for("react.fragment");
export const jsx = (...args: any[]) => runtime.jsx(...unwrapType(args));
export const jsxs = (...args: any[]) => runtime.jsxs(...unwrapType(args));
