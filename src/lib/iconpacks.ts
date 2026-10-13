// Icon packs replace Discord's bundled image assets (the PNGs under
// Discord.app/assets) without modifying the app: every asset React Native
// resolves is checked against the active pack, which mirrors the assets/ layout
// (e.g. rosiecord's Plumpy pack: modules/main_tabs_v2/native/images/...).
//
// Packs live in Documents/Discordia/IconPacks/<name>/ or ship inside the app at
// Discord.app/DiscordiaIconPacks/<name>/ (IPA builds). Switching packs applies
// on reload. Native images from Assets.car are not covered; IPA builds can
// replace Assets.car for those.

import { PixelRatio } from "react-native";

import { callNative } from "@/core/bridge";
import { isSafeMode } from "@/core/loader";
import { settings } from "@/core/settings";
import { Logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { find, fromPredicate } from "@/metro";
import { resolveAssetSource } from "@/metro/common";

const logger = new Logger("IconPacks");

export interface IconPack {
    id: string;
    name: string;
    source: "documents" | "bundled";
    path: string;
}

interface PackIndex {
    path: string;
    files: string[];
}

interface ResolverAsset {
    name: string;
    type: string;
    httpServerLocation: string;
    scales: number[];
    width?: number;
    height?: number;
}

export const listIconPacks = () => callNative<IconPack[]>("iconpacks.list");

let active: { id: string; path: string; files: Set<string> } | null = null;
export const getActiveIconPack = () => active?.id ?? null;

/** Path of `asset` at `scale` relative to the assets/ directory. */
function assetPath(asset: ResolverAsset, scale: number) {
    const directory = asset.httpServerLocation.replace(/^\/?assets\/?/, "");
    const suffix = scale === 1 ? "" : `@${scale}x`;
    return `${directory ? `${directory}/` : ""}${asset.name}${suffix}.${asset.type}`;
}

/** The pack's replacement for `asset`, preferring the scale closest to the screen's. */
function resolveFromPack(asset: ResolverAsset | undefined) {
    if (!active || !asset?.httpServerLocation) return null;

    const ratio = PixelRatio.get();
    const scales = [...(asset.scales?.length ? asset.scales : [1])]
        .sort((a, b) => Math.abs(a - ratio) - Math.abs(b - ratio));

    for (const scale of scales) {
        const file = assetPath(asset, scale);
        if (active.files.has(file)) {
            return {
                __packager_asset: true,
                width: asset.width,
                height: asset.height,
                uri: `file://${encodeURI(`${active.path}/${file}`)}`,
                scale,
            };
        }
    }
    return null;
}

export async function initIconPack() {
    const id = settings.iconPack;
    if (!id || isSafeMode()) return;

    try {
        const index = await callNative<PackIndex>("iconpacks.index", id);
        active = { id, path: index.path, files: new Set(index.files) };
    } catch (e) {
        logger.error(`Could not load icon pack ${id}`, e);
        return;
    }

    // Every image source goes through AssetSourceResolver#defaultAsset unless a
    // custom transformer claims it first, so patch that first.
    const AssetSourceResolver = find(fromPredicate(
        m => typeof m === "function" && typeof m.prototype?.defaultAsset === "function" && typeof m.prototype?.scaledAssetPath === "function",
        "discordia.AssetSourceResolver",
    ));

    if (AssetSourceResolver) {
        corePatcher.instead("defaultAsset", AssetSourceResolver.prototype, function (this: { asset: ResolverAsset }, args, original) {
            return resolveFromPack(this.asset) ?? original.apply(this, args);
        });
    } else if (typeof resolveAssetSource.addCustomSourceTransformer === "function") {
        resolveAssetSource.addCustomSourceTransformer((resolver: { asset: ResolverAsset }) => resolveFromPack(resolver.asset));
    } else {
        logger.warn("No asset resolver hook point found; icon pack not applied");
        return;
    }

    logger.info(`Icon pack ${id} active (${active.files.size} files)`);
}
