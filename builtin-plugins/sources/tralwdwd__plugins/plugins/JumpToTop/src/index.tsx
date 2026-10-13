import { patchActionSheets } from "./patches/actionsheets";
import { patchJumpToPresent } from "./patches/jumptopresent";
import settings from "./components/settings";
import { initStorage, storage } from "./storage";
import { plugins } from "@vendetta/plugins";
import CharCounterWarningModal from "./components/CharCounterWarningModal";
import { findByProps } from "@vendetta/metro";
import { createUnpatcher } from "@lib/patcher";

const { cleanup, stop } = createUnpatcher();

const { openAlert } = findByProps("openAlert", "dismissAlert");

export default {
    onLoad() {
        initStorage();

        patchJumpToPresent(cleanup);
        patchActionSheets(cleanup);

        if (
            hasEnabledCharCounterPlugin() &&
            !storage.hasSeenCharCounterWarning
        ) {
            openAlert(
                "jumptotop-char-counter-warning",
                <CharCounterWarningModal />,
            );
        }
    },

    onUnload() {
        stop();
    },

    settings,
};

function hasEnabledCharCounterPlugin() {
    return (
        Object.values(plugins).find((p) => p?.manifest?.name === "Char Counter")
            ?.enabled ?? false
    );
}
