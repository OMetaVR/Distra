// Function patching on top of spitroast, with per-owner bookkeeping so a
// plugin's patches can all be undone when it stops.

import * as spitroast from "spitroast";

type Unpatch = () => boolean;
type AnyFn = (...args: any[]) => any;

export type BeforeCallback = (args: any[]) => any[] | void;
export type AfterCallback = (args: any[], ret: any) => any;
export type InsteadCallback = (args: any[], original: AnyFn) => any;

export interface Patcher {
    before(method: string, parent: any, callback: BeforeCallback, once?: boolean): Unpatch;
    after(method: string, parent: any, callback: AfterCallback, once?: boolean): Unpatch;
    instead(method: string, parent: any, callback: InsteadCallback, once?: boolean): Unpatch;
    /** Tracks an arbitrary cleanup function alongside the patches. */
    addCleanup(cleanup: () => unknown): void;
    unpatchAll(): void;
}

export function createPatcher(owner: string): Patcher {
    const cleanups = new Set<() => unknown>();

    const track = (unpatch: Unpatch): Unpatch => {
        const wrapped = () => {
            cleanups.delete(wrapped);
            return unpatch();
        };
        cleanups.add(wrapped);
        return wrapped;
    };

    const guard = <C extends AnyFn>(kind: string, method: string, callback: C): C => (function (this: unknown, ...args: any[]) {
        try {
            return callback.apply(this, args);
        } catch (e) {
            console.error(`[${owner}] ${kind} patch on ${method} threw`, e);
            // An instead patch that throws falls back to the original function.
            if (kind === "instead") return (args[1] as AnyFn)(...(args[0] as any[]));
            return undefined;
        }
    }) as C;

    const assertPatchable = (method: string, parent: any) => {
        if (parent == null || typeof parent[method] !== "function") {
            throw new TypeError(`[${owner}] cannot patch "${method}": not a function on the target (${parent === null ? "null" : typeof parent?.[method]})`);
        }
    };

    return {
        before: (method, parent, callback, once) => (assertPatchable(method, parent),
            track(spitroast.before(method as never, parent, guard("before", method, callback) as never, once))),
        after: (method, parent, callback, once) => (assertPatchable(method, parent),
            track(spitroast.after(method as never, parent, guard("after", method, callback) as never, once))),
        instead: (method, parent, callback, once) => (assertPatchable(method, parent),
            track(spitroast.instead(method as never, parent, guard("instead", method, callback) as never, once))),
        addCleanup: cleanup => void cleanups.add(cleanup),
        unpatchAll() {
            for (const cleanup of [...cleanups]) {
                cleanups.delete(cleanup);
                try {
                    cleanup();
                } catch (e) {
                    console.error(`[${owner}] cleanup failed`, e);
                }
            }
        },
    };
}

/** Patcher for Discordia's own core patches. */
export const corePatcher = createPatcher("Discordia");

/**
 * spitroast with Vendetta's signature, but a callback that throws can't break Discord:
 * the error is logged and the original behavior is kept (for `instead`, the original
 * function is called). Plugin bugs inside render patches would otherwise crash the app.
 */
function guarded<K extends "before" | "after" | "instead">(kind: K) {
    return (method: string, parent: any, callback: AnyFn, once?: boolean) => {
        const safe = function (this: unknown, ...args: any[]) {
            try {
                return callback.apply(this, args);
            } catch (e) {
                console.error(`[Discordia] plugin ${kind} patch on "${method}" threw`, e);
                if (kind === "instead") return (args[1] as AnyFn).apply(this, args[0]);
                return undefined;
            }
        };
        return (spitroast[kind] as any)(method, parent, safe, once) as Unpatch;
    };
}

export const before = guarded("before");
export const after = guarded("after");
export const instead = guarded("instead");
