// Remembers which module satisfied a filter so later launches of the same
// Discord build can skip the full module scan (which initializes every module).

import { readJSON, writeJSON } from "@/core/fs";
import { debounce } from "@/lib/utils";

import type { ModuleID } from "./types";

const CACHE_VERSION = 2;
const CACHE_PATH = "cache/metro.json";

interface CacheData {
    v: number;
    build: string;
    moduleCount: number;
    finds: Record<string, ModuleID[]>;
}

let cache: CacheData | null = null;

export async function loadMetroCache(build: string) {
    const moduleCount = Object.keys(globalThis.modules).length;
    const fresh: CacheData = { v: CACHE_VERSION, build, moduleCount, finds: {} };

    const stored = await readJSON<CacheData>(CACHE_PATH).catch(() => null);
    cache = stored?.v === CACHE_VERSION && stored.build === build && stored.moduleCount === moduleCount
        ? stored
        : fresh;
}

const save = debounce(() => {
    if (cache) writeJSON(CACHE_PATH, cache).catch(() => { });
}, 2000);

export function getCachedIds(key: string): ModuleID[] | undefined {
    return cache?.finds[key];
}

export function setCachedIds(key: string, ids: ModuleID[]) {
    if (!cache) return;
    const previous = cache.finds[key];
    if (previous && previous.length === ids.length && previous.every((id, i) => id === ids[i])) return;
    cache.finds[key] = ids;
    save();
}

export async function clearMetroCache() {
    if (cache) cache.finds = {};
    await writeJSON(CACHE_PATH, cache ?? {});
}
