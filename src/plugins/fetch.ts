import { withTimeout } from "@/lib/utils";

/** Fetches text without caching, failing on non-2xx responses and after `timeout` ms. */
export async function fetchText(url: string, timeout = 15000): Promise<string> {
    // RN's fetch polyfill honors `cache: "no-store"` (cache-busting query), its typings just omit it.
    const response = await withTimeout(fetch(url, { cache: "no-store" } as RequestInit), timeout, `Timed out fetching ${url}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText || "error"} fetching ${url}`);
    return response.text();
}

export const fetchJSON = async <T = any>(url: string, timeout?: number): Promise<T> =>
    JSON.parse(await fetchText(url, timeout)) as T;

/**
 * Resolves `path` against a base URL. React Native's URL polyfill does not
 * implement relative resolution, so this handles the cases manifests use.
 */
export function resolveUrl(base: string, path: string) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
    const origin = base.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i)?.[0] ?? "";
    if (path.startsWith("/")) return origin + path;
    const directory = base.slice(0, base.lastIndexOf("/") + 1);
    return directory + path.replace(/^\.\//, "");
}

/**
 * Evaluates plugin code in the global scope (not this module's), with a source
 * URL so stack traces name the plugin.
 */
export function evaluate<T = any>(code: string, sourceURL: string): T {
    return (0, eval)(`${code}\n//# sourceURL=${sourceURL.replace(/\s/g, "%20")}`) as T;
}
