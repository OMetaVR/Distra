import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { React } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");

const ClipboardUtils = findByProps("SUPPORTS_COPY", "copy");
const ToastPresets = findByProps("presentCopiedToClipboard");

const IdIcon =
    getAssetIDByName("ic_id") ??
    getAssetIDByName("IdIcon") ??
    getAssetIDByName("id");

let unpatches: (() => void)[] = [];

function safeCopy(text: string) {
    try {
        if (ClipboardUtils?.copy) {
            ClipboardUtils.copy(text);
        } else if (ClipboardUtils?.copyToClipboard) {
            ClipboardUtils.copyToClipboard(text);
        }
    } catch (e) {
        console.error("[CopyUserID] Copy failed:", e);
    }
}

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

                    if (instance.__patchedForCopyId) return;
                    instance.__patchedForCopyId = true;

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

                            const alreadyExists = findInReactTree(
                                component,
                                (c: any) => c?.props?.label === "Copy User ID"
                            );
                            if (alreadyExists) return;

                            const copyIdButton = React.createElement(
                                ActionSheetRow,
                                {
                                    label: "Copy User ID",
                                    icon: React.createElement(
                                        ActionSheetRow.Icon,
                                        { source: IdIcon }
                                    ),
                                    onPress: () => {
                                        const currentAuthorId =
                                            instance.__currentActiveMessage?.author?.id;

                                        ActionSheet.hideActionSheet();

                                        if (!currentAuthorId) return;

                                        setTimeout(() => {
                                            safeCopy(currentAuthorId);
                                            ToastPresets?.presentCopiedToClipboard?.();
                                        }, 100);
                                    }
                                }
                            );

                            // Create a new group at the very top with just the copy button
                            // Use optional chaining for groups.unshift
                            if (groups?.unshift) {
                                groups.unshift(
                                    React.createElement(ActionSheetRow.Group, null, copyIdButton)
                                );
                            } else {
                                console.log("[CopyUserID] Could not insert button - skipping");
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