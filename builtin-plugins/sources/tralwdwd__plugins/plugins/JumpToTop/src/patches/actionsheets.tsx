import { after, Cleanup } from "@lib/patcher";
import { find, findByName, findByProps } from "@vendetta/metro";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { findInReactTree } from "@vendetta/utils";
import { UpsideDown } from "../components/UpsideDown";
import { storage } from "../storage";
import {
    ChannelType,
    jumpToTopOfDifferentChannel,
    jumpToTopOfForum,
} from "../utils";

const { ActionSheetRow } = findByProps("ActionSheetRow");

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

const ForumPostLongPressActionSheet = findByFilePath(
    "modules/action_sheet/native/components/LongPressForumPostActionSheet.tsx",
    false,
);

const ChannelLongPressActionSheet = findByFilePath(
    "modules/channel/native/ChannelLongPressActionSheet.tsx",
    false
);

const SYM_PATCHED = Symbol.for("Patched by JumpToTop");

function findActionGroups(tree: any) {
    return findInReactTree(
        tree,
        (node) => node?.[0]?.props?.children
            ?.find?.(
                (child: any) => child?.props.label
            )
    );
}

function buildJumpToTopRow(onPress: () => void) {
    return (
        <ActionSheetRow.Group>
            <ActionSheetRow
                label="Jump To Top"
                icon={
                    <UpsideDown>
                        <ActionSheetRow.Icon
                            source={getAssetIDByName("ArrowLargeDownIcon")}
                        />
                    </UpsideDown>
                }
                onPress={onPress}
            />
        </ActionSheetRow.Group>
    );
}

const allowedChannelTypes = [
    ChannelType.GUILD_TEXT,
    ChannelType.DM,
    ChannelType.GUILD_VOICE,
    ChannelType.GROUP_DM,
    ChannelType.GUILD_NEWS,
    ChannelType.GUILD_STORE,
    ChannelType.NEWS_THREAD,
    ChannelType.PUBLIC_THREAD,
    ChannelType.PRIVATE_THREAD,
];

export function patchActionSheets(cleanup: Cleanup) {
    cleanup(
        after("default", ForumPostLongPressActionSheet, ([{ thread }], ret) => {
            if (!storage.actionSheets || ret[SYM_PATCHED]) return;

            const actions = findActionGroups(ret);
            if (!actions) return;

            actions.unshift(
                buildJumpToTopRow(() =>
                    jumpToTopOfForum(thread.guild_id, thread.id),
                ),
            );

            ret[SYM_PATCHED] = true;
        }),

        after("default", ChannelLongPressActionSheet, (_, ret) => {
            if (!storage.actionSheets || ret?.[SYM_PATCHED]) return;

            const channel = ret?.props?.channel;
            if (!channel) return;

            if (!allowedChannelTypes.includes(channel.type)) return;

            cleanup(
                after("type", ret, (_, component) => {
                    const actions = findActionGroups(component);
                    if (!actions) return;

                    actions.unshift(
                        buildJumpToTopRow(() =>
                            jumpToTopOfDifferentChannel(
                                channel.guild_id ?? "@me",
                                channel.id,
                            ),
                        ),
                    );
                }),
            );

            ret[SYM_PATCHED] = true;
        }),
    );
}
