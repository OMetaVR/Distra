// Last Active: jump to your (or someone's) most recent message in a channel. Port of Equicord's
// LastActive (GPL-3.0-or-later, by Crxa). It asks Discord's message search for the newest message
// by that author in the channel, then opens the channel at that message. On mobile:
//   - "Your Last Message" is in a channel's or thread's long-press menu (desktop: channel context menu);
//   - "Last Message in #channel" is in a profile's "..." menu, for the channel you're viewing
//     (desktop: user context menu in a channel).

import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { addProfileMenuItems } from "@/lib/profileMenu";
import { findByFilePath, findByProps, findByStoreName } from "@/metro";
import { showToast } from "@/ui/toasts";

import { definePlugin } from "../types";

const logger = new Logger("LastActive");
let patcher = createPatcher("LastActive");

const UserStore = findByStoreName("UserStore");
const ChannelStore = findByStoreName("ChannelStore");
const SelectedChannelStore = findByStoreName("SelectedChannelStore");

const SHEETS = [
    "modules/channel/native/ChannelLongPressActionSheet.tsx",
    "modules/threads/native/components/ThreadLongPressActionSheet.tsx",
];
const TIMEOUT = 15000;
const PATCHED = Symbol.for("distra.lastActive.sheet");

const hideSheet = () => findByProps("openLazy", "hideActionSheet")?.hideActionSheet?.();

/** The id of the newest message by `authorId` in `channel`, via Discord's search. */
async function findLastMessage(channel: any, authorId: string): Promise<string | null> {
    const rest = findByProps("getAPIBaseURL", "get");
    // React Native's URLSearchParams is incomplete, so the query is built by hand.
    const query = (params: Record<string, string>) => Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
    const common = { author_id: authorId, sort_by: "timestamp", sort_order: "desc", offset: "0" };
    const url = channel.guild_id
        ? `/guilds/${channel.guild_id}/messages/search?${query({ ...common, channel_id: channel.id })}`
        : `/channels/${channel.id}/messages/search?${query(common)}`;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Search timed out")), TIMEOUT));
    const response: any = await Promise.race([rest.get({ url }), timeout]);
    // 202: the channel isn't indexed yet.
    if (response?.status === 202) throw Object.assign(new Error("indexing"), { indexing: true });
    const messages: any[] = response?.body?.messages?.flat?.() ?? [];
    return messages.find(message => message?.id && message.author?.id === authorId)?.id ?? null;
}

async function jumpToLastMessage(channel: any, authorId: string) {
    try {
        const messageId = await findLastMessage(channel, authorId);
        if (!messageId) return showToast(authorId === UserStore.getCurrentUser()?.id ? "You haven't sent anything here" : "No messages from them here", findAssetId("CircleInformationIcon"));
        findByProps("transitionToGuild", "transitionTo")?.transitionTo?.(`/channels/${channel.guild_id ?? "@me"}/${channel.id}/${messageId}`);
    } catch (e: any) {
        if (e?.indexing) return showToast("Discord is still indexing this channel. Try again in a moment.", findAssetId("CircleInformationIcon"));
        logger.error("Couldn't find the last message", e);
        showToast("Couldn't search this channel", findAssetId("WarningIcon"));
    }
}

function findGroups(tree: any, depth = 0): any[] | undefined {
    if (!tree || typeof tree !== "object" || depth > 25) return undefined;
    if (Array.isArray(tree)) {
        // An array of row groups (a group's children may be a single row, e.g. one another plugin added).
        const hasRows = (group: any) => [group?.props?.children].flat().some((child: any) => child?.props?.label != null);
        if (tree.some(hasRows)) return tree;
        for (const node of tree) {
            const found = findGroups(node, depth + 1);
            if (found) return found;
        }
        return undefined;
    }
    return findGroups(tree.props?.children, depth + 1);
}

/** "Your Last Message" at the end of channel and thread long-press menus. */
function patchChannelSheets() {
    const { ActionSheetRow } = findByProps("ActionSheetRow") ?? {};
    if (!ActionSheetRow) return logger.warn("ActionSheetRow not found");
    for (const file of SHEETS) {
        const Sheet = findByFilePath(file, false);
        if (typeof Sheet?.default !== "function") {
            logger.warn(`Not found: ${file}`);
            continue;
        }
        patcher.after("default", Sheet, (_, ret) => {
            const channel = ret?.props?.channel ?? ChannelStore.getChannel?.(ret?.props?.channelId);
            if (!channel?.id || !ret || ret[PATCHED] || typeof ret.type !== "function") return;
            ret[PATCHED] = true;
            patcher.after("type", ret, (__, tree) => {
                const groups = findGroups(tree);
                if (!groups) return;
                groups.push(
                    <ActionSheetRow.Group key="distra-last-active">
                        <ActionSheetRow
                            label="Your Last Message"
                            icon={<ActionSheetRow.Icon source={findAssetId("ChatArrowRightIcon")} />}
                            onPress={() => {
                                hideSheet();
                                void jumpToLastMessage(channel, UserStore.getCurrentUser()?.id);
                            }}
                        />
                    </ActionSheetRow.Group>,
                );
            });
        });
    }
}

function channelName(channel: any) {
    if (channel.guild_id) return `#${channel.name}`;
    return channel.name || "this DM";
}

export default definePlugin({
    id: "distra:last-active",
    manifest: {
        name: "Last Active",
        description: "Jump to your last message in a channel (hold the channel), or someone's (their profile's ... menu).",
        authors: [{ name: "Distra" }, { name: "Crxa (Equicord LastActive)" }],
        version: "1.0.0",
    },
    start() {
        patcher = createPatcher("LastActive");
        try {
            patchChannelSheets();
        } catch (e) {
            logger.error("Couldn't patch the channel menus", e);
        }
        const menu = addProfileMenuItems(patcher, props => {
            const userId = props?.user?.id;
            const channel = props?.channel ?? ChannelStore.getChannel?.(SelectedChannelStore.getChannelId?.());
            if (!userId || !channel?.id) return;
            return [{
                label: `Last Message in ${channelName(channel)}`,
                action: () => {
                    hideSheet();
                    void jumpToLastMessage(channel, userId);
                },
            }];
        });
        if (!menu) logger.warn("Profile menu not found");
    },
    stop() {
        patcher.unpatchAll();
    },
    api: { findLastMessage, jumpToLastMessage },
});
