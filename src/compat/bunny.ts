// `bunny` object handed to Bunny spec-3 plugins. Bunny's own API mostly
// re-exported the same primitives as its Vendetta layer, so this is built on top
// of `window.vendetta`.
// Reference: examples/Bunny/src/lib/index.ts

import { deleteJsxCreate, onJsxCreate } from "@/lib/jsx";
import * as metro from "@/metro";
import { showToast } from "@/ui/toasts";
import * as components from "@/ui/components";

import { createVendettaObject } from "./vendetta";

export function createBunnyObject() {
    const vd = globalThis.vendetta ?? createVendettaObject();
    return {
        version: `distra-${DISTRA_VERSION}`,
        api: {
            patcher: vd.patcher,
            storage: vd.storage,
            commands: vd.commands,
            assets: { findAssetId: vd.ui.assets.getAssetIDByName, ...vd.ui.assets },
            debug: vd.debug,
            settings: { settings: vd.settings, loaderConfig: vd.loader.config },
            react: { jsx: { onJsxCreate, deleteJsxCreate } },
        },
        // Not supported by Distra yet; present so theme/font-aware plugins degrade gracefully.
        themes: { themes: {}, selectTheme: vd.themes.selectTheme, applyTheme: vd.themes.applyTheme, getCurrentTheme: () => null, getThemeFromLoader: () => null },
        fonts: { fonts: {}, installFont: () => Promise.reject(new Error("Fonts are not supported by Distra yet")), saveFont: () => Promise.reject(new Error("Fonts are not supported by Distra yet")) },
        metro: { ...metro, common: vd.metro.common },
        ui: {
            components: { ...vd.ui.components, ...components },
            toasts: { showToast },
            alerts: vd.ui.alerts,
        },
        utils: vd.utils,
    };
}

declare global {
    // eslint-disable-next-line no-var
    var bunny: ReturnType<typeof createBunnyObject> | undefined;
}

/** Bunny/Kettu-era plugins also reach for `window.bunny` directly (e.g. `bunny.metro.findByFilePath`). */
export function installBunnyGlobals() {
    globalThis.bunny = createBunnyObject();
}
