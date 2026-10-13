// Lazy proxies let modules reference Discord internals at import time while
// deferring the (expensive, and early-on impossible) Metro lookup until first use.

const factories = new WeakMap<object, () => unknown>();

const unconfigurable = new Set(["arguments", "caller", "prototype"]);
const isUnconfigurable = (key: PropertyKey) => typeof key === "string" && unconfigurable.has(key);

/**
 * Returns a proxy that resolves `factory()` on first interaction and forwards everything to it.
 * The result is cached unless `cache` is false. Use `unwrapLazy` to get the real value.
 */
export function proxyLazy<T>(factory: () => T, { cache = true, hint = "unknown" } = {}): T {
    let resolved = false;
    let value: any;

    const resolve = () => {
        if (!cache || !resolved) {
            value = factory();
            resolved = value != null;
        }
        if (value == null) throw new TypeError(`Lazy value (${hint}) resolved to ${value}`);
        return value;
    };

    // Bound functions are callable and constructable but have no `prototype`,
    // which keeps the proxy invariants for ownKeys/getOwnPropertyDescriptor simple.
    const dummy = function () {}.bind(null);
    factories.set(dummy, resolve);

    const proxy = new Proxy(dummy, {
        apply: (_, thisArg, args) => Reflect.apply(resolve(), thisArg, args),
        construct: (_, args, newTarget) => Reflect.construct(resolve(), args, newTarget === proxy ? resolve() : newTarget),
        get: (_, key) => {
            if (key === lazySymbol) return resolve;
            const target = resolve();
            return Reflect.get(target, key, target);
        },
        set: (_, key, val) => Reflect.set(resolve(), key, val),
        has: (_, key) => key === lazySymbol || Reflect.has(resolve(), key),
        deleteProperty: (_, key) => Reflect.deleteProperty(resolve(), key),
        defineProperty: (_, key, desc) => Reflect.defineProperty(resolve(), key, desc),
        ownKeys: () => {
            const keys = Reflect.ownKeys(resolve()).filter(key => !isUnconfigurable(key));
            return [...keys, ...Reflect.ownKeys(dummy).filter(key => !keys.includes(key))];
        },
        getOwnPropertyDescriptor: (_, key) => {
            const desc = Reflect.getOwnPropertyDescriptor(resolve(), key);
            if (desc) desc.configurable = true;
            return desc ?? Reflect.getOwnPropertyDescriptor(dummy, key);
        },
        getPrototypeOf: () => Reflect.getPrototypeOf(resolve()),
        setPrototypeOf: (_, proto) => Reflect.setPrototypeOf(resolve(), proto),
        isExtensible: () => true,
        preventExtensions: () => false,
    });

    factories.set(proxy, resolve);
    return proxy as T;
}

export const lazySymbol = Symbol.for("discordia.lazy");

/** Whether `value` is a proxy created by `proxyLazy`. */
export function isLazy(value: unknown): boolean {
    return (typeof value === "function" || typeof value === "object") && value !== null && factories.has(value);
}

/** Resolves a lazy proxy to its underlying value; returns other values unchanged. */
export function unwrapLazy<T>(value: T): T {
    const factory = isLazy(value) ? factories.get(value as object) : undefined;
    return factory ? (factory() as T) : value;
}

/**
 * Destructures properties of a lazily resolved object without resolving it.
 * `const { A, B } = lazyDestructure(() => findByProps("A", "B"))`
 */
export function lazyDestructure<T extends Record<PropertyKey, any>>(factory: () => T): T {
    const lazyObject = proxyLazy(factory);
    return new Proxy({} as T, {
        get: (_, key) => proxyLazy(() => (lazyObject as any)[key], { hint: String(key) }),
    });
}

/** Memoizes a zero-argument function. */
export function lazyValue<T>(factory: () => T): () => T {
    let cached: { value: T } | undefined;
    return () => (cached ??= { value: factory() }).value;
}
