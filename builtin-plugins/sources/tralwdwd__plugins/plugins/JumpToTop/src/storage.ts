import { storage as pluginStorage } from "@vendetta/plugin";

export const storage = pluginStorage as {
    jumpToPresent: boolean;
    actionSheets: boolean;
    hasSeenCharCounterWarning: boolean;
    oldButton: boolean;
};

export function initStorage() {
    storage.jumpToPresent ??= true;
    storage.actionSheets ??= true;
    storage.hasSeenCharCounterWarning ??= false;
    storage.oldButton ??= false;
}
