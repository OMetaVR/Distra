import { before, after } from "@vendetta/patcher"
import { getAssetIDByName as getAssetId } from "@vendetta/ui/assets"
import { findByProps } from "@vendetta/metro"
import { findInReactTree } from "@vendetta/utils";
import { React, clipboard } from "@vendetta/metro/common"
import { Forms } from "@vendetta/ui/components"
import CoolRow from "../components/CoolRow";

const ActionSheet = findByProps("openLazy", "hideActionSheet")

export default () => before("openLazy", ActionSheet, (ctx) => {
    const [component, args, actionMessage] = ctx
    const message = actionMessage?.message;
    if (args !== "MessageLongPressActionSheet" || !message) return;
    component.then(instance => {
        const unpatch = after("default", instance, (_, component) => {
            React.useEffect(() => () => { unpatch() }, [])
            const buttons = findInReactTree(
                component,
                (x) => x?.[0]?.type?.name === "ButtonRow"
            );
            if (!buttons) return component;

            if (message.hasFlag(8192)) {
                buttons.splice(5, 0,
                    <CoolRow
                        label="Download Voice Message"
                        icon={getAssetId("ic_download_24px")}
                        onPress={async () => {
                            await findByProps("downloadMediaAsset").downloadMediaAsset(message.attachments[0].url, 0)
                            findByProps("hideActionSheet").hideActionSheet()
                        }}
                    />)
                buttons.splice(6, 0,
                    <CoolRow
                        label="Copy Voice Message URL"
                        icon={getAssetId("copy")}
                        onPress={async () => {
                            clipboard.setString(message.attachments[0].url)
                            findByProps("hideActionSheet").hideActionSheet()
                        }}
                    />)
            }
        })
    })
})