// Lookup for Discord's bundled image assets by name (e.g. "WrenchIcon").

import { assetsRegistry } from "@/metro/common";
import { allModules } from "@/metro/modules";

export interface Asset {
    name: string;
    type: string;
    httpServerLocation: string;
    scales: number[];
    width?: number;
    height?: number;
    hash?: string;
}

const idsByName = new Map<string, number>();
let indexedUpTo = 0;
let fullyLoaded = false;

/** Asset ids are 1-based indices into React Native's asset registry. */
function indexRegistry() {
    for (let id = indexedUpTo + 1; ; id++) {
        const asset: Asset | undefined = assetsRegistry.getAssetByID(id);
        if (!asset) break;
        if (!idsByName.has(asset.name)) idsByName.set(asset.name, id);
        indexedUpTo = id;
    }
}

export function findAssetId(name: string): number | undefined {
    indexRegistry();
    if (idsByName.has(name) || fullyLoaded) return idsByName.get(name);

    // Assets register themselves when their module first runs, so load every module once.
    fullyLoaded = true;
    for (const _ of allModules());
    indexRegistry();
    return idsByName.get(name);
}

export function getAssetById(id: number): Asset | undefined {
    return assetsRegistry.getAssetByID(id);
}
