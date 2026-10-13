import { findByProps } from "@vendetta/metro";
import { useProxy } from "@vendetta/storage";
import { storage } from "../storage";

const Design = findByProps("Stack", "Button", "Text");
const { Text } = Design;

export default function CharCounterWarningModal() {
    useProxy(storage);

    const { AlertModal, AlertActionButton } = findByProps(
        "AlertModal",
        "AlertActionButton",
    );

    return (
        <AlertModal
            title={"JumpToTop"}
            content={
                <Text variant={"text-md/bold"}>
                    You have the "Char Counter" plugin enabled, which is known
                    to cause issues with JumpToTop.
                </Text>
            }
            extraContent={
                <Text variant={"text-sm/bold"} align={"center"}>
                    You can solve this by disabling it or setting "Position" to
                    "Inside Textbox" in its settings (if it's already set, you
                    can press Acknowledge and ignore this).
                </Text>
            }
            actions={
                <AlertActionButton
                    text={"Acknowledge"}
                    variant={"primary"}
                    onPress={() => (storage.hasSeenCharCounterWarning = true)}
                />
            }
        />
    );
}
