// Remote debugger: lets a development machine run JS in the live app and read its logs, so
// plugins can be checked against the real Discord instead of only its disassembly.
//
// Enabled from Settings > Distra > Developer > Remote debugger with the URL printed by
// `pnpm devtools` (scripts/devtools.mjs). The device long-polls that server for code to run and
// posts back results and log lines; nothing listens on the device. React's commits are observed
// through a minimal devtools hook (installed before Discord's bundle) so the rendered component
// tree can be inspected: see `dt.tree()`.

import { loader } from "@/core/loader";
import * as log from "@/lib/logger";
import { componentSources } from "@/metro/modules";

declare global {
    // eslint-disable-next-line no-var
    var __REACT_DEVTOOLS_GLOBAL_HOOK__: any;
    // eslint-disable-next-line no-var
    var dt: typeof helpers | undefined;
}

export interface RemoteDebuggerConfig {
    enabled: boolean;
    /** e.g. http://192.168.1.20:4041/?token=abc123 */
    url: string;
}

const config = (): RemoteDebuggerConfig | undefined => (loader.config as any).remoteDebugger;
export const isRemoteDebuggerEnabled = () => config()?.enabled === true && !!config()?.url;

// ---------------------------------------------------------------------------
// React fiber roots

const fiberRoots = new Set<any>();

/**
 * Minimal React DevTools hook: React registers its renderer here and reports every committed
 * root, which is all `dt.tree()` needs. Must run before React initializes (entry.ts).
 */
export function installReactHook() {
    if (globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
    const renderers = new Map<number, unknown>();
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        isDisabled: false,
        renderers,
        inject(renderer: unknown) {
            const id = renderers.size + 1;
            renderers.set(id, renderer);
            return id;
        },
        onCommitFiberRoot(_id: number, root: any) {
            fiberRoots.add(root);
        },
        onCommitFiberUnmount() { },
        onPostCommitFiberRoot() { },
        onScheduleFiberRoot() { },
        setStrictMode() { },
        checkDCE() { },
    };
}

// ---------------------------------------------------------------------------
// Inspection helpers, available to remote code as `dt`

/** A component's display name: restored/declared name, displayName, or its source file. */
function nameOf(type: any): string {
    if (type == null) return "?";
    if (typeof type === "string") return type;
    const source = componentSources.get(type) ?? (type.type && componentSources.get(type.type));
    const named = type.displayName || type.name || type.type?.displayName || type.type?.name || type.render?.displayName || type.render?.name;
    if (named && named.length > 2) return named;
    if (source) return source.slice(source.lastIndexOf("#") + 1);
    if (type.$$typeof === Symbol.for("react.provider") || type._context) return "Provider";
    if (type.$$typeof === Symbol.for("react.context")) return "Context";
    return named || "anonymous";
}

function* walk(fiber: any, depth = 0): Generator<[any, number]> {
    while (fiber) {
        yield [fiber, depth];
        if (fiber.child) yield* walk(fiber.child, depth + 1);
        fiber = fiber.sibling;
    }
}

const isHost = (fiber: any) => typeof fiber.type === "string" || fiber.type == null;

function propsSummary(props: any, max = 8): string {
    if (!props || typeof props !== "object") return "";
    const keys = Object.keys(props).filter(key => key !== "children");
    const parts = keys.slice(0, max).map(key => {
        const value = props[key];
        const shown = typeof value === "string" ? JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)
            : typeof value === "number" || typeof value === "boolean" || value == null ? String(value)
                : typeof value === "function" ? "fn" : Array.isArray(value) ? `[${value.length}]` : "{…}";
        return `${key}=${shown}`;
    });
    if (keys.length > max) parts.push(`+${keys.length - max}`);
    return parts.join(" ");
}

const helpers = {
    /** The most recently committed fiber roots. */
    roots: () => [...fiberRoots].filter(root => root?.current),

    /** Every fiber (optionally under `from`) for which `predicate` is true. */
    fibers(predicate: (fiber: any) => boolean, from?: any) {
        const found: any[] = [];
        const starts = from ? [from.child] : helpers.roots().map(root => root.current);
        for (const start of starts) {
            for (const [fiber] of walk(start)) {
                try {
                    if (predicate(fiber)) found.push(fiber);
                } catch { }
            }
        }
        return found;
    },

    /** Fibers whose component name or source path contains `text`. */
    byName: (text: string) => helpers.fibers(fiber => !isHost(fiber)
        && (nameOf(fiber.elementType ?? fiber.type).includes(text) || (componentSources.get(fiber.elementType) ?? componentSources.get(fiber.type) ?? "").includes(text))),

    /**
     * The rendered component tree as text. `match` limits it to subtrees of components whose name
     * contains it; host views are hidden unless `hosts` is set.
     */
    tree({ match, depth = 25, hosts = false, props = true, limit = 400 }: { match?: string; depth?: number; hosts?: boolean; props?: boolean; limit?: number } = {}) {
        const starts = match ? helpers.byName(match) : helpers.roots().map(root => root.current);
        const lines: string[] = [];
        for (const start of starts) {
            const base: number = match ? 0 : -1;
            const stack: Array<[any, number]> = [[start, 0]];
            while (stack.length && lines.length < limit) {
                const [fiber, level] = stack.pop()!;
                const show = hosts || !isHost(fiber);
                const nextLevel = show ? level + 1 : level;
                if (show && level - base <= depth) {
                    const type = fiber.elementType ?? fiber.type;
                    const source = componentSources.get(type) ?? componentSources.get(fiber.type);
                    lines.push(`${"  ".repeat(level)}${nameOf(type)}${source ? ` (${source.split("#")[0]})` : ""}${props ? ` ${propsSummary(fiber.memoizedProps)}` : ""}`);
                }
                if (level - base > depth) continue;
                const children: any[] = [];
                for (let child = fiber.child; child; child = child.sibling) children.push(child);
                for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], nextLevel]);
            }
            if (match) lines.push("—");
        }
        if (lines.length >= limit) lines.push(`… (limit ${limit})`);
        return lines.join("\n");
    },

    /** Name and source file of a component, element type or fiber. */
    describe(value: any) {
        const type = value?.elementType ?? value?.type ?? value;
        return { name: nameOf(type), source: componentSources.get(type) ?? componentSources.get(value?.type) };
    },

    nameOf,
    inspect: (value: unknown, depth?: number) => inspect(value, depth),
    stop: () => stopRemoteDebugger(),
};

// ---------------------------------------------------------------------------
// Serializing results

function inspect(value: unknown, depth = 3, seen = new Set<unknown>()): unknown {
    if (value === undefined) return "undefined";
    if (value === null || typeof value === "boolean" || typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "symbol") return value.toString();
    if (typeof value === "function") {
        const source = componentSources.get(value);
        return `[Function ${value.name || "anonymous"}${source ? ` ${source}` : ""}]`;
    }
    if (value instanceof Error) return { error: value.message, stack: value.stack };
    if (seen.has(value)) return "[Circular]";
    if (depth < 0) return Array.isArray(value) ? `[Array(${value.length})]` : "[Object]";
    seen.add(value);
    try {
        const v = value as any;
        if (v.$$typeof === Symbol.for("react.transitional.element") || v.$$typeof === Symbol.for("react.element")) {
            return { element: nameOf(v.type), key: v.key, props: inspect(v.props, depth - 1, seen) };
        }
        if (v.tag !== undefined && v.stateNode !== undefined && "memoizedProps" in v) {
            return { fiber: nameOf(v.elementType ?? v.type), props: inspect(v.memoizedProps, depth - 1, seen) };
        }
        if (Array.isArray(v)) return v.slice(0, 100).map(item => inspect(item, depth - 1, seen)).concat(v.length > 100 ? [`… ${v.length - 100} more`] : []);
        if (v instanceof Map) return { Map: inspect(Object.fromEntries([...v.entries()].slice(0, 100)), depth - 1, seen) };
        if (v instanceof Set) return { Set: inspect([...v].slice(0, 100), depth - 1, seen) };
        const out: Record<string, unknown> = {};
        const keys = Object.keys(v);
        for (const key of keys.slice(0, 150)) {
            try {
                out[key] = inspect(v[key], depth - 1, seen);
            } catch (e) {
                out[key] = `[Threw: ${String(e)}]`;
            }
        }
        if (keys.length > 150) out["…"] = `${keys.length - 150} more keys`;
        return out;
    } finally {
        seen.delete(value);
    }
}

// ---------------------------------------------------------------------------
// Transport (long polling over fetch; works wherever the device can reach the server)

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function compile(code: string): () => unknown {
    // Expressions first ("dt.tree()"), then statement bodies ("const x = 1; return x").
    try {
        // eslint-disable-next-line no-eval
        return (0, eval)(`(function () { return (${code}\n); })`);
    } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        // eslint-disable-next-line no-eval
        return (0, eval)(`(function () { ${code}\n })`);
    }
}

const RUN_TIMEOUT_MS = 25_000;

async function run(code: string) {
    const started = Date.now();
    try {
        let result = compile(code).call(globalThis);
        // A promise that never settles must not stall every command queued behind it.
        if (result && typeof (result as any).then === "function") {
            result = await Promise.race([
                result,
                new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`still pending after ${RUN_TIMEOUT_MS / 1000}s`)), RUN_TIMEOUT_MS)),
            ]);
        }
        return { ok: true, result: inspect(result, 4), ms: Date.now() - started };
    } catch (e) {
        return { ok: false, result: inspect(e), ms: Date.now() - started };
    }
}

let started = false;
let stopped = false;

export interface RemoteDebuggerStatus {
    state: "off" | "connecting" | "connected" | "error";
    detail?: string;
    since: number;
}
let status: RemoteDebuggerStatus = { state: "off", since: Date.now() };
const statusListeners = new Set<() => void>();
export const getRemoteDebuggerStatus = () => status;
export function onRemoteDebuggerStatus(listener: () => void) {
    statusListeners.add(listener);
    return () => void statusListeners.delete(listener);
}
function setStatus(state: RemoteDebuggerStatus["state"], detail?: string) {
    if (status.state === state && status.detail === detail) return;
    status = { state, detail, since: Date.now() };
    statusListeners.forEach(listener => listener());
    // Shown in Developer > Logs and the tweak's log, which is how a failing connection is diagnosed.
    const message = `Remote debugger ${state}${detail ? `: ${detail}` : ""}`;
    if (state === "error") log.logger.warn(message);
    else log.logger.info(message);
}

/** Stops polling (tests; also reachable as `dt.stop()`). */
export function stopRemoteDebugger() {
    stopped = true;
}

export function startRemoteDebugger() {
    if (started || !isRemoteDebuggerEnabled()) return;
    started = true;
    globalThis.dt = helpers;

    // React Native's URL polyfill can't read query parameters; parse by hand.
    const match = /^(https?:\/\/[^/?#]+)[^?#]*(?:\?([^#]*))?/.exec(config()!.url.trim());
    if (!match) return setStatus("error", `not a valid URL: ${config()!.url}`);
    const base = match[1];
    const token = decodeURIComponent(/(?:^|&)token=([^&]*)/.exec(match[2] ?? "")?.[1] ?? "");
    const session = Math.random().toString(36).slice(2, 10);
    const query = `token=${encodeURIComponent(token)}&session=${session}`;
    const post = (path: string, body: unknown) => fetch(`${base}${path}?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    // Log lines and console output, batched.
    let pendingLogs: unknown[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const queueLog = (entry: unknown) => {
        pendingLogs.push(entry);
        flushTimer ??= setTimeout(() => {
            flushTimer = undefined;
            const batch = pendingLogs;
            pendingLogs = [];
            post("/log", batch).catch(() => { });
        }, 500);
    };

    for (const entry of log.getLogEntries()) queueLog(entry);
    log.onLogEntry(queueLog);

    const console = (globalThis as any).console;
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
        const original = console?.[level];
        if (typeof original !== "function") continue;
        console[level] = (...args: unknown[]) => {
            if (!log.writingToConsole) {
                queueLog({ time: Date.now(), level, tag: "console", message: args.map(arg => typeof arg === "string" ? arg : JSON.stringify(inspect(arg, 2))).join(" ") });
            }
            return original.apply(console, args);
        };
    }

    const errorUtils = (globalThis as any).ErrorUtils;
    const previousHandler = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
        queueLog({ time: Date.now(), level: "error", tag: isFatal ? "fatal" : "uncaught", message: String(error?.stack ?? error) });
        return previousHandler?.(error, isFatal);
    });

    (async () => {
        let failures = 0;
        while (!stopped) {
            try {
                setStatus("connecting", base);
                const hello = await post("/hello", {
                    loader: { version: loader.version, discord: loader.discord, bundle: loader.bundle, jailbroken: loader.jailbroken },
                });
                if (hello.status === 401) throw new Error("the server rejected the token");
                if (!hello.ok) throw new Error(`HTTP ${hello.status}`);
                failures = 0;
                setStatus("connected", base);
                while (!stopped) {
                    const response = await fetch(`${base}/poll?${query}`);
                    if (response.status === 401) throw new Error("Remote debugger rejected the token");
                    if (!response.ok) throw new Error(`poll: HTTP ${response.status}`);
                    const { commands } = await response.json() as { commands: Array<{ id: string; code: string }> };
                    for (const command of commands ?? []) {
                        const result = await run(command.code);
                        await post("/result", { id: command.id, ...result });
                    }
                }
            } catch (e) {
                // Server not running or unreachable: back off up to 30s and keep trying.
                setStatus("error", `${base}: ${e instanceof Error ? e.message : String(e)}`);
                failures++;
                await sleep(Math.min(30_000, 2_000 * failures));
            }
        }
    })();
}
