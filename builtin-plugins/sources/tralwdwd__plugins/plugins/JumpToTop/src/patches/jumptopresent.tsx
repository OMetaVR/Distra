import { after, Cleanup } from "@lib/patcher";
import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { getAssetIDByName } from "@vendetta/ui/assets";
import JumpToTopButton from "../components/JumpToTopButton";
import { OldButtons } from "../components/OldButtons";
import { storage } from "../storage";
import { ChannelType } from "../utils";

// TODO: switch back to name based filter once stable reaches 350202

declare global {
    interface Window {
        bunny: {
            metro: {
                findByFilePath: (path: string, defaultExp?: boolean) => any;
            }
        }
    }
}

const { findByFilePath } = window.bunny.metro;

const JumpToPresentModule = findByFilePath(
    "components_native/chat/JumpToPresentButton.tsx",
    false,
);
const Design = findByProps("Stack", "Button", "Text");
const { Stack } = Design;

const ChannelStore = findByStoreName("ChannelStore");

const SYM_PATCHED = Symbol.for("Patched by JumpToTop");

type MaybePatchedElement = React.ReactElement & {
    [SYM_PATCHED]?: boolean;
};

export function patchJumpToPresent(cleanup: Cleanup) {
    cleanup(
        after(
            "default",
            JumpToPresentModule,
            ([{ channelId }], original: MaybePatchedElement) => {
                if (original == null || original[SYM_PATCHED]) return;

                const JumpToPresentButton = original.props?.children;

                /*
                 * Voice chat text channel uses the JumpToPresentButton
                 * to show the "X" icon when not scrolled up, so we have to
                 * make sure it is actually the JumpToPresentButton.
                 */
                if (!isJumpToPresentButton(JumpToPresentButton)) return;

                original[SYM_PATCHED] = true;

                const { type: channelType, guild_id: guildId } =
                    ChannelStore.getChannel(channelId);

                // Voice channel text counts as different channel
                const isNotCurrentChannel =
                    channelType === ChannelType.GUILD_VOICE;

                if (!storage.jumpToPresent) {
                    // Apply old button patch even if the
                    // JumpToTop in chats is disabled
                    if (storage.oldButton) {
                        original.props.children = (
                            <OldButtons
                                JumpToPresentButton={JumpToPresentButton}
                                noJumpToPresent
                            />
                        );
                    }

                    return;
                }

                original.props.children = (
                    <Stack>
                        {!storage.oldButton ? (
                            <>
                                {
                                    <JumpToTopButton
                                        isNotCurrentChannel={
                                            isNotCurrentChannel
                                        }
                                        details={{ channelId, guildId }}
                                        JumpToPresentButton={
                                            JumpToPresentButton
                                        }
                                    />
                                }
                                {JumpToPresentButton}
                            </>
                        ) : (
                            <OldButtons
                                isNotCurrentChannel={channelType === 2}
                                details={{ channelId, guildId }}
                                JumpToPresentButton={JumpToPresentButton}
                            />
                        )}
                    </Stack>
                );
            },
        ),
    );
}

function isJumpToPresentButton(button: React.ReactElement) {
    const ArrowIconId = getAssetIDByName("ArrowLargeDownIcon");

    return button.props?.icon === ArrowIconId;
}
