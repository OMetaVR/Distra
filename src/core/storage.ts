// Observable, persisted objects. The API mirrors Vendetta's storage
// (`createProxy`, `useProxy`, `createStorage`, `wrapSync`) so the compat
// layers can hand it to plugins directly.

import { useEffect, useReducer } from "react";

import { logger } from "@/lib/logger";
import { debounce } from "@/lib/utils";

import { readJSON, writeJSON } from "./fs";

export type StorageEvent = { type: "SET" | "DEL"; path: string[]; value?: unknown };
type Listener = (event: StorageEvent) => void;

const emitterSymbol = Symbol.for("distra.storage.emitter");
/** Where Vendetta's storage proxies expose their emitter; plugins read it directly. */
export const vendettaEmitterSymbol = Symbol.for("vendetta.storage.emitter");
const syncAwaitSymbol = Symbol.for("distra.storage.syncAwait");

type TypedListener = (event: StorageEvent["type"], data: { path: string[]; value?: unknown }) => void;

/**
 * Change events. `on(listener)` gets every event; `on("SET" | "DEL", listener)` and `off` are
 * Vendetta's emitter API, for plugins that subscribe to storage proxies themselves.
 */
export class Emitter {
    private listeners = new Set<Listener>();
    private typed = new Map<string, Set<TypedListener>>();
    on(listener: Listener): () => void;
    on(event: string, listener: TypedListener): () => void;
    on(eventOrListener: string | Listener, listener?: TypedListener) {
        if (typeof eventOrListener === "function") {
            this.listeners.add(eventOrListener);
            return () => void this.listeners.delete(eventOrListener);
        }
        const set = this.typed.get(eventOrListener) ?? new Set();
        set.add(listener!);
        this.typed.set(eventOrListener, set);
        return () => void this.off(eventOrListener, listener!);
    }
    off(event: string, listener: TypedListener) {
        this.typed.get(event)?.delete(listener);
    }
    once(event: string, listener: TypedListener) {
        const unsubscribe = this.on(event, (...args) => (unsubscribe(), listener(...args)));
    }
    emit(event: StorageEvent) {
        for (const listener of this.listeners) listener(event);
        for (const listener of this.typed.get(event.type) ?? []) listener(event.type, { path: event.path, value: event.value });
    }
}

/** Wraps `target` in a deep proxy that emits an event for every write. */
export function createProxy<T extends object>(target: T = {} as T): { proxy: T; emitter: Emitter } {
    const emitter = new Emitter();
    const proxies = new WeakMap<object, any>();

    const wrap = (object: any, path: string[]): any => {
        const cached = proxies.get(object);
        if (cached) return cached;

        const proxy = new Proxy(object, {
            get(t, key, receiver) {
                if (key === emitterSymbol || key === vendettaEmitterSymbol) return emitter;
                const value = Reflect.get(t, key, receiver);
                if (typeof key === "symbol" || value == null || typeof value !== "object") return value;
                return wrap(value, [...path, key]);
            },
            set(t, key, value) {
                const ok = Reflect.set(t, key, value);
                if (typeof key !== "symbol") emitter.emit({ type: "SET", path: [...path, key], value });
                return ok;
            },
            deleteProperty(t, key) {
                const ok = Reflect.deleteProperty(t, key);
                if (typeof key !== "symbol") emitter.emit({ type: "DEL", path: [...path, key] });
                return ok;
            },
        });
        proxies.set(object, proxy);
        return proxy;
    };

    return { proxy: wrap(target, []), emitter };
}

/** Re-renders the calling component whenever the storage proxy changes. */
export function useProxy<T extends object>(storage: T): T {
    const emitter: Emitter | undefined = (storage as any)?.[emitterSymbol];
    const [, forceUpdate] = useReducer((n: number) => ~n, 0);

    useEffect(() => emitter?.on(() => forceUpdate()), [emitter]);
    return storage;
}

export function subscribe<T extends object>(storage: T, listener: Listener) {
    const emitter: Emitter | undefined = (storage as any)?.[emitterSymbol];
    if (!emitter) throw new TypeError("Not a storage proxy");
    return emitter.on(listener);
}

export interface StorageBackend<T = any> {
    get(): T | Promise<T>;
    set(data: T): void | Promise<void>;
}

/** Persists a JSON value at `path` (relative to Documents/Distra). */
export function createFileBackend<T extends object>(path: string, defaults: T = {} as T): StorageBackend<T> {
    return {
        async get() {
            try {
                const stored = await readJSON<T>(path);
                // Top-level merge so keys added in newer versions get their defaults.
                return Object.assign(structuredCloneSafe(defaults), stored);
            } catch (e) {
                logger.error(`Failed to read ${path}, using defaults`, e);
                return structuredCloneSafe(defaults);
            }
        },
        set: data => writeJSON(path, data),
    };
}

export function createMemoryBackend<T extends object>(defaults: T = {} as T): StorageBackend<T> {
    let data = structuredCloneSafe(defaults);
    return { get: () => data, set: next => void (data = next) };
}

const structuredCloneSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Loads data from `backend` and returns a proxy that writes back (debounced) on change. */
export async function createStorage<T extends object>(backend: StorageBackend<T>): Promise<T> {
    const data = await backend.get();
    const { proxy, emitter } = createProxy(data);

    const save = debounce(() => {
        Promise.resolve(backend.set(data)).catch(e => logger.error("Failed to persist storage", e));
    }, 250);
    emitter.on(save);
    return proxy;
}

/**
 * Returns a placeholder proxy immediately that forwards to the real storage once
 * it has loaded. Reads before then return undefined.
 */
export function wrapSync<T extends object>(store: Promise<T>): T {
    let awaited: T | undefined;
    const callbacks: Array<() => void> = [];
    store.then(value => {
        awaited = value;
        callbacks.splice(0).forEach(cb => cb());
    });

    return new Proxy({} as T, {
        ...Object.fromEntries(Object.getOwnPropertyNames(Reflect).map(name => [
            name,
            (_: unknown, ...args: any[]) => {
                if (name === "get" && args[0] === syncAwaitSymbol) return (cb: () => void) => awaited ? cb() : callbacks.push(cb);
                if (!awaited) return name === "get" ? undefined : name === "ownKeys" ? [] : name === "getOwnPropertyDescriptor" ? undefined : false;
                return (Reflect as any)[name](awaited, ...args);
            },
        ])),
    });
}

/** Resolves once every `wrapSync` store passed in has loaded. */
export function awaitStorage(...stores: object[]) {
    return Promise.all(stores.map(store => new Promise<void>(resolve => {
        const awaiter = (store as any)[syncAwaitSymbol];
        typeof awaiter === "function" ? awaiter(resolve) : resolve();
    })));
}

/** Storage file for a JSON blob in Documents/Distra, with in-memory fallback when the bridge is missing. */
export function createFileStorage<T extends object>(path: string, defaults: T): Promise<T> {
    return createStorage(createFileBackend(path, defaults)).catch(e => {
        logger.error(`Storage ${path} unavailable, falling back to memory`, e);
        return createStorage(createMemoryBackend(defaults));
    });
}
