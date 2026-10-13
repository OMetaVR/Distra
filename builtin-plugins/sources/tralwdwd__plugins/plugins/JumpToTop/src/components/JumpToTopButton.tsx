import { ReactNative as RN, React } from "@vendetta/metro/common";
import { jumpToTop } from "../utils";
import { UpsideDown } from "./UpsideDown";

export default function JumpToTopButton({
    isNotCurrentChannel = false,
    details = {},
    JumpToPresentButton,
}: {
    isNotCurrentChannel: boolean;
    details: { guildId?: string; channelId?: string };
    JumpToPresentButton: React.ReactElement;
}) {
    return (
        // Theres no arrow up icon so we flip the arrow down one.
        <UpsideDown>
            {React.cloneElement(JumpToPresentButton, {
                ...JumpToPresentButton.props,
                onPress: jumpToTop(isNotCurrentChannel, details),
            })}
        </UpsideDown>
    );
}
