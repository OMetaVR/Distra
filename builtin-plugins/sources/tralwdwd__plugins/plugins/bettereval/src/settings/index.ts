import { patchTabsUI } from "./tabs";

export function registerSettingsTile(tile: SettingsTile) {
    const patches: (() => void)[] = [];

    let disabled = false;

    const predicate = tile.predicate ?? (() => true);
    tile.predicate = () => (disabled ? false : predicate());

    patches.push(patchTabsUI(tile));

    patches.push(() => (disabled = true));

    return () => {
        for (const unpatch of patches) {
            unpatch();
        }
    }
}