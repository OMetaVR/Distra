import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { React } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");
const ForwardModule = findByProps("openForwardModal");

const ForwardIcon = getAssetIDByName("ArrowAngleRightUpIcon");

let unpatches: (() => void)[] = [];

export default {
    onLoad() {
        const unpatchOpenLazy = before(
            "openLazy",
            ActionSheet,
            ([comp, args, msg]) => {
                if (
                    args !== "MessageLongPressActionSheet" ||
                    !msg?.message
                ) {
                    return;
                }

                comp.then((instance: any) => {
                    instance.__currentActiveMessage = msg.message;

                    if (instance.__patchedForForward) return;
                    instance.__patchedForForward = true;

                    const unpatchDefault = after(
                        "default",
                        instance,
                        (_args: any, component: any) => {
                            // Use optional chaining for groups
                            const groups: any[] = findInReactTree(
                                component,
                                (c: any) =>
                                    Array.isArray(c) &&
                                    c[0]?.type?.name === "ActionSheetRowGroup"
                            );

                            // Skip if no groups
                            if (!groups?.length) return;

                            // 1. Remove native forward button from lower native groups
                            for (let i = 1; i < groups.length; i++) {
                                const children: any[] = findInReactTree(
                                    groups[i],
                                    (c: any) =>
                                        Array.isArray(c) &&
                                        c.some(
                                            (child: any) =>
                                                child?.type?.name ===
                                                "ActionSheetRow"
                                        )
                                );

                                if (children) {
                                    const nativeIdx = children.findIndex(
                                        (c: any) => {
                                            const label = (
                                                c?.props?.label || ""
                                            ).toLowerCase();
                                            return (
                                                label === "forward" ||
                                                label === "forward message"
                                            );
                                        }
                                    );

                                    if (nativeIdx !== -1) {
                                        children.splice(nativeIdx, 1);
                                        break;
                                    }
                                }
                            }

                            // 2. Check if Forward button already exists
                            const alreadyExists = findInReactTree(
                                component,
                                (c: any) =>
                                    c?.props?.label === "Forward Message"
                            );
                            if (alreadyExists) return;

                            // 3. Create Forward row
                            const forwardButton = React.createElement(
                                ActionSheetRow,
                                {
                                    label: "Forward Message",
                                    icon: React.createElement(
                                        ActionSheetRow.Icon,
                                        { source: ForwardIcon }
                                    ),
                                    onPress: () => {
                                        const currentMsg =
                                            instance.__currentActiveMessage;

                                        ActionSheet.hideActionSheet();

                                        if (!currentMsg) return;

                                        setTimeout(() => {
                                            ForwardModule?.openForwardModal?.({
                                                message: currentMsg,
                                                source: "message_context_menu"
                                            });
                                        }, 100);
                                    }
                                }
                            );

                            // 4. Try to find Copy User ID and insert after it with optional chaining
                            let inserted = false;

                            // Search all groups for Copy User ID
                            for (let i = 0; i < groups.length; i++) {
                                const groupChildren: any[] = findInReactTree(
                                    groups[i],
                                    (c: any) =>
                                        Array.isArray(c) &&
                                        c.some(
                                            (child: any) =>
                                                child?.type?.name === "ActionSheetRow"
                                        )
                                );

                                if (groupChildren) {
                                    const copyIdIdx = groupChildren.findIndex(
                                        (c: any) => c?.props?.label === "Copy User ID"
                                    );

                                    if (copyIdIdx !== -1) {
                                        // Found Copy User ID, insert Forward after it
                                        groupChildren.splice(copyIdIdx + 1, 0, forwardButton);
                                        inserted = true;
                                        break;
                                    }
                                }
                            }

                            // 5. If Copy User ID wasn't found, create a new group at the top
                            // Use optional chaining for groups.unshift
                            if (!inserted && groups?.unshift) {
                                groups.unshift(
                                    React.createElement(ActionSheetRow.Group, null, forwardButton)
                                );
                            } else if (!inserted) {
                                console.log("[Forward] Could not insert button - skipping");
                            }
                        }
                    );

                    unpatches.push(unpatchDefault);
                });
            }
        );

        unpatches.push(unpatchOpenLazy);
    },

    onUnload() {
        for (const unpatch of unpatches) {
            unpatch?.();
        }
        unpatches = [];
    }
};