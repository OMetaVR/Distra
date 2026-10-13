import { getRegistry } from "./modules";
import type { Filter, FilterFn, ModuleID } from "./types";

/**
 * Creates a filter factory. The key identifies the filter across launches so
 * lookups can be cached per Discord build, so it must be derived only from `args`.
 */
export function createFilter<A extends unknown[]>(
    name: string,
    predicate: (args: A, exports: any, id: ModuleID, isDefault: boolean) => boolean,
) {
    return (...args: A): Filter => {
        const fn: FilterFn = (exports, id, isDefault) => {
            try {
                return predicate(args, exports, id, isDefault);
            } catch {
                return false;
            }
        };
        return Object.assign(fn, { key: `${name}(${args.map(a => JSON.stringify(a)).join(",")})` });
    };
}

/** Wraps an ad-hoc predicate. Its key is derived from the source, so prefer the named filters. */
export function fromPredicate(predicate: (exports: any, id: ModuleID) => boolean, key?: string): Filter {
    const fn: FilterFn = (exports, id) => {
        try {
            return predicate(exports, id);
        } catch {
            return false;
        }
    };
    return Object.assign(fn, { key: key ?? `predicate(${predicate.toString()})` });
}

export const byProps = createFilter<string[]>("byProps", (props, m) =>
    props.length > 0 && props.every(prop => m[prop] != null));

/** Like byProps, but every prop must be a function (use for anything that will be patched). */
export const byMethods = createFilter<string[]>("byMethods", (props, m) =>
    props.length > 0 && props.every(prop => typeof m[prop] === "function"));

export const byName = createFilter<[string]>("byName", ([name], m) =>
    typeof m === "function" && m.name === name);

export const byDisplayName = createFilter<[string]>("byDisplayName", ([name], m) =>
    m.displayName === name);

export const byTypeName = createFilter<[string]>("byTypeName", ([name], m) =>
    m.type?.name === name);

export const byTypeDisplayName = createFilter<[string]>("byTypeDisplayName", ([name], m) =>
    m.type?.displayName === name);

export const byStoreName = createFilter<[string]>("byStoreName", ([name], m) =>
    typeof m.getName === "function" && m.getName.length === 0 && m.getName() === name);

export const byFilePath = createFilter<[string]>("byFilePath", ([path], _, id) =>
    getRegistry()[id]?.__filePath === path);

/** Matches modules whose only export is `prop`, e.g. Discord's single-component modules. */
export const bySingularProp = createFilter<[string]>("bySingularProp", ([prop], m) =>
    m[prop] !== undefined && Object.keys(m).length === 1);

/**
 * File name of a module's source without directory, platform suffix or extension:
 * "modules/a/native/Foo.tsx" -> "Foo", "design/Navigator/native/Navigator.native.tsx" -> "Navigator".
 */
export const fileNameOf = (path: string | undefined) =>
    path?.slice(path.lastIndexOf("/") + 1).replace(/(?:\.(?:native|ios|android))?\.[jt]sx?$/, "");

/**
 * Matches modules whose source file is named `name` (e.g. "UserProfileCard.tsx").
 * Discord minifies component function names, but a component's file is almost
 * always named after it, so this stands in for name-based lookups.
 */
export const byFileName = createFilter<[string]>("byFileName", ([name], _, id) =>
    fileNameOf(getRegistry()[id]?.__filePath) === name);
