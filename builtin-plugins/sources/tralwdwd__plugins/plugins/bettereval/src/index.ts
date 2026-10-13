import { plugin } from "@vendetta";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { manifest } from "@vendetta/plugin";
import { registerSettingsTile } from "./settings";
import { EvalPage } from "./EvalPage";

import { patchInspect } from "./fixes";

let patches: (() => void)[] = [];

export default {
    onLoad() {
        patches.push(
            registerSettingsTile({
                key: plugin.manifest.name,
                icon: getAssetIDByName(manifest.vendetta?.icon ?? ""),
                title: () => "Evaluate JavaScript",
                page: EvalPage,
            }),
        );
        patches.push(patchInspect());
    },

    onUnload() {
        for (const unpatch of patches) {
            unpatch();
        }

        patches = [];
    },
};
