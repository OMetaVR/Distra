export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: A) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message = `Timed out after ${ms}ms`): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            value => (clearTimeout(timer), resolve(value)),
            error => (clearTimeout(timer), reject(error)),
        );
    });
}

export function errorToString(error: unknown): string {
    if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
    return String(error);
}

type TreeFilter = (node: any) => boolean;

/** Depth-first search through an arbitrary object tree. */
export function findInTree(
    tree: any,
    filter: TreeFilter,
    { walkable, ignore = [], maxDepth = 100 }: { walkable?: string[]; ignore?: string[]; maxDepth?: number } = {},
): any {
    const seen = new WeakSet<object>();
    const search = (node: any, depth: number): any => {
        if (depth > maxDepth || node == null || typeof node !== "object") return undefined;
        if (seen.has(node)) return undefined;
        seen.add(node);
        if (filter(node)) return node;

        const keys = Array.isArray(node) ? node.keys() : walkable ?? Object.keys(node);
        for (const key of keys) {
            if (ignore.includes(String(key))) continue;
            const found = search(node[key], depth + 1);
            if (found !== undefined) return found;
        }
        return undefined;
    };
    return search(tree, 0);
}

/** Searches a React element tree, only descending through props/children. */
export const findInReactTree = (tree: any, filter: TreeFilter) =>
    findInTree(tree, filter, { walkable: ["props", "children", "child", "sibling"] });

export const isHttpUrl = (value: string) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value);

/** File-system-safe identifier for arbitrary strings such as plugin URLs. */
export function slugify(value: string) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
    const readable = value.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-48);
    return `${readable}-${(hash >>> 0).toString(36)}`;
}
