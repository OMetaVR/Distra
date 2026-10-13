import type { ExtractAction, FluxAction, FluxStore } from "@vencord/discord-types";
import { findByStoreName } from "@vendetta/metro";

import type { CollectiblesItemType } from "@lib/records";

// Discord 2xx+ removed ProfileEffectStore; effects are now collectibles shop products. This
// fallback lists the effects (with their configs) from the shop categories Discord has loaded.
const CollectiblesCategoryStore: any = findByStoreName("CollectiblesCategoryStore");

function shopProfileEffects(): ProfileEffect[] {
    const effects = new Map<string, ProfileEffect>();
    const categories = CollectiblesCategoryStore?.categories;
    const list: any[] = categories instanceof Map ? [...categories.values()] : Object.values(categories ?? {});
    for (const category of list) {
        for (const product of category?.products ?? []) {
            for (const item of product?.items ?? []) {
                if (item?.type !== 1 || !item.config || effects.has(item.id)) continue;
                effects.set(item.id, { id: item.id, skuId: item.skuId ?? product.skuId, config: item.config });
            }
        }
    }
    return [...effects.values()];
}

const fallbackStore = {
    get profileEffects() {
        return shopProfileEffects();
    },
    getProfileEffectById: (id: string) => shopProfileEffects().find(effect => effect.id === id),
    canFetch: () => false,
    hasFetched: () => true,
    isFetching: false,
    tryItOutId: null,
};

export const ProfileEffectStore: $ProfileEffectStore
    = findByStoreName("ProfileEffectStore") ?? fallbackStore as any;

export type ProfileEffectStoreAction = ExtractAction<FluxAction, "LOGOUT" | "PROFILE_EFFECTS_SET_TRY_IT_OUT" | "USER_PROFILE_EFFECTS_FETCH" | "USER_PROFILE_EFFECTS_FETCH_FAILURE" | "USER_PROFILE_EFFECTS_FETCH_SUCCESS">;

declare class $ProfileEffectStore extends FluxStore<ProfileEffectStoreAction> {
    static displayName: "ProfileEffectStore";

    canFetch(): boolean;
    get fetchError(): Error | undefined;
    getProfileEffectById(effectId: string): ProfileEffect | undefined;
    hasFetched(): boolean;
    get isFetching(): boolean;
    get profileEffects(): ProfileEffect[];
    get tryItOutId(): string | null;
}

export interface ProfileEffect {
    config: ProfileEffectConfig;
    id: string;
    skuId: string;
}

export interface ProfileEffectConfig {
    accessibilityLabel: string;
    animationType: number;
    description: string;
    effects: {
        duartion: number;
        height: number;
        loop: boolean;
        loopDelay: number;
        position: {
            x: number;
            y: number;
        };
        src: string;
        start: number;
        width: number;
        zIndex: number;
    }[];
    id: string;
    reducedMotionSrc: string;
    sku_id: string;
    staticFrameSrc?: string;
    thumbnailPreviewSrc: string;
    title: string;
    type: CollectiblesItemType.PROFILE_EFFECT;
}
