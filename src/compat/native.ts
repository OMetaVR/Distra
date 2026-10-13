// Keeps plugins that hook the removed `DCDChatManager.updateRows` working: Discord now sends chat
// rows through the DCDChat native component's `updateRows` command, with the same arguments
// (view, rows JSON, ...). Those calls are routed through `chatManagerShim`, so patches on it see
// and can rewrite the rows. See core/native.ts for the `DCDChatManager` alias itself.

import { chatManagerShim, setChatUpdateRows } from "@/core/native";
import { logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { waitFor } from "@/metro";
import { fromPredicate } from "@/metro/filters";

const isChatComponent = fromPredicate(m =>
    typeof m?.Commands?.updateRows === "function" && typeof m.Commands.clearRows === "function" && m.__INTERNAL_VIEW_CONFIG != null,
"chatNativeComponent");

export function patchChatCommands() {
    waitFor(isChatComponent, ({ Commands }) => {
        const original = Commands.updateRows;
        setChatUpdateRows((...args: unknown[]) => original.apply(Commands, args));
        corePatcher.instead("updateRows", Commands, (args: unknown[]) => chatManagerShim.updateRows(...args));
        logger.debug("Routed chat updateRows through DCDChatManager shim");
    });
}
