import { lazyDestructure } from "@/lib/lazy";
import { findByProps } from "@/metro";
import { toasts } from "@/metro/common";

const { uuid4 } = lazyDestructure(() => findByProps("uuid4"));

/** Shows a Discord toast. `icon` is an asset id from `findAssetId`. */
export function showToast(content: string, icon?: number) {
    try {
        toasts.open({ key: `discordia-toast-${uuid4()}`, content, source: icon, icon });
    } catch (e) {
        console.warn("[Discordia] toast failed:", content, e);
    }
}
