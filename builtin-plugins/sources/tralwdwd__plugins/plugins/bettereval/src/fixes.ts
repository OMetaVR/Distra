import { findByProps } from "@vendetta/metro";
import { before } from "@lib/patcher";

const util = findByProps("inspect");

export function patchInspect() {
    return before("inspect", util, (args) => {
        if (args[0] == window) {
            args[1] ? (args[1].depth = 0) : args.push({ depth: 0 });
        }

        return args;
    });
}
