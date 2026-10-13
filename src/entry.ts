// First code to run. The tweak evaluates this bundle right before Discord's
// main.jsbundle, in the same JS runtime. We:
//
//   1. capture Metro's module registry and `__r` as Discord's bundle defines them,
//   2. when Discord requires its entry module (id 0), start holding the native
//      calls that launch the UI (AppRegistry.runApplication), then let the entry
//      module run normally,
//   3. initialize Discordia, then replay the held calls so Discord's UI starts.
//
// Unlike Kettu/rain (examples/Kettu-github/src/entry.ts), the entry module runs
// synchronously: in bridgeless mode native may call runApplication as soon as
// the bundle finishes evaluating, and AppRegistry only exists once the entry
// module has run. Discord must start even if Discordia fails, so every path
// below ends with the held calls being released.

import { instead } from "spitroast";

import type { ModuleID, ModuleRegistry } from "@/metro/types";

// Discord's bundle defines `window` later; plugins and our code expect it now.
(globalThis as any).window = globalThis;

// Remote debugger: observe React commits (needs to precede React). Only when enabled.
try {
    if ((globalThis as any).__DISCORDIA_LOADER__?.config?.remoteDebugger?.enabled) require("@/core/devtools").installReactHook();
} catch { }

// Old native module names (DCDChatManager, MediaManager, ...) for plugins; must precede Discord's bundle.
try {
    require("@/core/native").installNativeModuleAliases();
} catch (e) {
    (globalThis as any).console?.error?.("[Discordia] native module aliases failed", e);
}

/** Longest Discord's UI is held for initialization before giving up on it. */
const INIT_TIMEOUT_MS = 10_000;

/** Logs a startup milestone (also forwarded to the tweak's on-device log). */
function trace(message: string) {
    try {
        require("@/lib/logger").logger.info(`[entry] ${message}`);
    } catch {
        (globalThis as any).console?.log?.(`[Discordia] [entry] ${message}`);
    }
}

function report(error: unknown) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    (globalThis as any).console?.error?.(`[Discordia] ${message}`);
    try {
        require("@/lib/logger").logger.error("[entry] Startup failed", error);
    } catch { }
    try {
        (globalThis as any).alert?.(`Discordia failed to initialize. Discord will start without it.\n\n${message}`);
    } catch { }
}

async function initialize() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Initialization took longer than ${INIT_TIMEOUT_MS / 1000}s`)), INIT_TIMEOUT_MS);
    });
    try {
        await Promise.race([require("@/index").init(), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/** Runs `callback` with `object[key]` now, or as soon as it is assigned. Returns a cleanup. */
function whenAssigned(object: any, key: string, callback: (value: any) => void): () => void {
    if (object[key] != null) {
        callback(object[key]);
        return () => { };
    }

    let assigned = false;
    Object.defineProperty(object, key, {
        configurable: true,
        enumerable: false,
        get: () => undefined,
        set(value) {
            assigned = true;
            Object.defineProperty(object, key, { value, writable: true, configurable: true, enumerable: true });
            callback(value);
        },
    });
    return () => {
        if (!assigned) delete object[key];
    };
}

/** Holds native calls that start Discord's UI until the returned release function is called. */
function holdNativeCalls() {
    const held: Array<() => void> = [];
    const cleanups: Array<() => unknown> = [];
    let released = false;

    const bridge = (globalThis as any).__fbBatchedBridge;
    if (bridge) {
        // Legacy bridge: calls arrive through the batched bridge queue.
        cleanups.push(instead("callFunctionReturnFlushedQueue", bridge, (args: any[], original: any) => {
            if (!released && (args[0] === "AppRegistry" || !bridge.getCallableModule(args[0]))) {
                held.push(() => bridge.getCallableModule(args[0]) && bridge.__callFunction(...args));
                return bridge.flushedQueue();
            }
            return original.apply(bridge, args);
        }));
    }

    // Bridgeless: native calls RN$AppRegistry.runApplication directly. AppRegistry
    // assigns the global when its module first runs, possibly not yet.
    cleanups.push(whenAssigned(globalThis, "RN$AppRegistry", registry => {
        trace("RN$AppRegistry available; holding runApplication");
        cleanups.push(instead("runApplication", registry, (args: any[], original: any) => {
            if (released) return original.apply(registry, args);
            held.push(() => original.apply(registry, args));
        }));
    }));

    trace(`Holding UI start (legacy bridge: ${bridge != null}, RN$AppRegistry: ${(globalThis as any).RN$AppRegistry != null ? "present" : "not yet assigned"})`);

    return function release() {
        if (released) return;
        released = true;
        trace(`Releasing ${held.length} held native call(s)`);
        cleanups.forEach(cleanup => cleanup());
        for (const call of held.splice(0)) {
            try {
                call();
            } catch (e) {
                report(e);
            }
        }
    };
}

function runEntry(originalRequire: (id: ModuleID) => unknown) {
    trace(`Discord's entry module requested; registry ${globalThis.modules == null ? "NOT captured" : `has ${globalThis.modules instanceof Map ? globalThis.modules.size : Object.keys(globalThis.modules).length} modules`}`);
    if (globalThis.modules instanceof Map) {
        globalThis.modules = Object.fromEntries(globalThis.modules) as ModuleRegistry;
    }

    // Let patches modify Discord's frozen objects.
    Object.freeze = Object.seal = (<T>(o: T) => o) as typeof Object.freeze;

    let release = () => { };
    try {
        require("@/metro/modules").patchModuleFactories();
        release = holdNativeCalls();
    } catch (e) {
        report(e);
    }

    try {
        originalRequire(0);
        trace("Discord's entry module ran");
    } catch (e) {
        report(e);
        release();
        throw e;
    }

    initialize()
        .catch(report)
        .finally(() => {
            release();
            setTimeout(() => require("@/index").start().catch(report), 0);
        });
}

if (typeof (globalThis as any).__r === "undefined") {
    // Normal case: we run before Discord's bundle.
    let metroRequire: ((id: ModuleID) => unknown) | undefined;
    let metroDefine: ((...args: unknown[]) => void) | undefined;

    Object.defineProperties(globalThis, {
        __r: {
            configurable: true,
            get: () => metroRequire,
            set(original: (id: ModuleID) => unknown) {
                metroRequire = function discordiaRequire(id: ModuleID) {
                    if (id !== 0) return original(id);
                    // Hand `__r` back to Metro before anything else can call it.
                    Object.defineProperty(globalThis, "__r", { value: original, writable: true, configurable: true });
                    runEntry(original);
                    return undefined;
                };
            },
        },
        __d: {
            configurable: true,
            get() {
                // Metro's `__c` resets and returns its module registry. Calling it right before
                // the first module is defined (the first read of `__d`) hands us the live,
                // still-empty registry. `__c` is assigned after `__d`, hence not in the setter.
                if ((globalThis as any).Object && !globalThis.modules && typeof globalThis.__c === "function") {
                    globalThis.modules = globalThis.__c();
                    Object.defineProperty(globalThis, "__d", { value: metroDefine, writable: true, configurable: true });
                }
                return metroDefine;
            },
            set(value: (...args: unknown[]) => void) {
                metroDefine = value;
            },
        },
    });
    trace("Evaluated before Discord's bundle; waiting for Metro");
} else {
    // Loaded after Discord's bundle (e.g. by a foreign loader): initialize in place.
    trace("Evaluated after Discord's bundle; initializing in place");
    initialize()
        .then(() => require("@/index").start())
        .catch(report);
}
