import { createUnpatcher } from "@lib/patcher";
import {
    patchMessageActionSheet,
    patchSearchListRow,
} from "./patches/searchlistrow";

const { cleanup, stop } = createUnpatcher();

export default {
    onLoad() {
        patchSearchListRow(cleanup);
        patchMessageActionSheet(cleanup);
    },

    onUnload() {
        stop();
    },
};
