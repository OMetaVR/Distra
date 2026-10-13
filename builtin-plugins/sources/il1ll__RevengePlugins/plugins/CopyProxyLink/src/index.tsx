import { before, after } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { findInReactTree } from "@vendetta/utils";
import { findByProps } from "@vendetta/metro";
import { React, clipboard } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { Forms } from "@vendetta/ui/components";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const { FormIcon } = Forms;

const unpatch = before("openLazy", LazyActionSheet, ([component, key, msg]) => {
    const message = msg?.message;
    if (!message || key !== "MessageLongPressActionSheet") return;

    const proxyUrl = 
        message.attachments?.[0]?.proxy_url || 
        message.attachments?.[0]?.proxyURL ||
        message.embeds?.[0]?.image?.proxyURL ||
        message.embeds?.[0]?.image?.proxy_url;

    if (!proxyUrl) return;

    component.then((instance: any) => {
        const unpatchAfter = after("default", instance, (_, component) => {
            React.useEffect(() => () => unpatchAfter(), []);

            const actionSheetContainer = findInReactTree(
                component,
                (x) => Array.isArray(x) && x[0]?.type?.name === "ActionSheetRowGroup",
            );

            if (actionSheetContainer && actionSheetContainer[1]) {
                const middleGroup = actionSheetContainer[1];
                const children = middleGroup.props.children;
                const ActionSheetRow = children[0].type;
                const firstIcon = children[0].props.icon;

                const messageLinkIndex = children.findIndex((c: any) => 
                    c?.props?.label?.toLowerCase().includes("message link")
                );

                const copyAction = () => {
                    LazyActionSheet.hideActionSheet();
                    clipboard.setString(proxyUrl);
                    showToast("Link Copied!", getAssetIDByName("LinkIcon"));
                };

                const newButton = (
                    <ActionSheetRow
                        label="Copy Proxy Link"
                        icon={{
                            $$typeof: firstIcon.$$typeof,
                            type: firstIcon.type,
                            key: null,
                            ref: null,
                            props: {
                                IconComponent: () => (
                                    <FormIcon
                                        style={{ opacity: 1 }}
                                        source={getAssetIDByName("LinkIcon")}
                                    />
                                ),
                            },
                        }}
                        onPress={copyAction}
                        key="copy-proxy-link"
                    />
                );

                if (messageLinkIndex !== -1) {
                    children.splice(messageLinkIndex + 1, 0, newButton);
                } else {
                    children.push(newButton);
                }
            }
        });
    });
});

export const onUnload = () => unpatch();
