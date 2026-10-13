import { storage } from "@vendetta/plugin";
import patchChat from "./patches/chat";
import patchDetails from "./patches/details";
import patchName from "./patches/name";
import patchTag from "./patches/tag";
import Settings from "./ui/pages/Settings";

let patches = [];

export default {
    onLoad: () => {
        storage.useRoleColor ??= false
        patches.push(patchChat())
        patches.push(patchTag())
        patches.push(patchName())
        patches.push(patchDetails())
    },
    onUnload: () => patches.forEach(unpatch => unpatch()),
    settings: Settings
}
