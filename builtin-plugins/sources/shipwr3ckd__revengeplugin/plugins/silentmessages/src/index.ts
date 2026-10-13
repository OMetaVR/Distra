import { before } from "@vendetta/patcher";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import { loadCommands, unloadCommands } from "./commands";

const MessageEvents = findByProps("sendMessage");
const ChannelStore = findByProps("getChannel");

storage.alwaysSilent ??= false;
storage.silentList ??= [];

function getUserID(channelId: string, mentions: any[]): string[] {
    const channel = ChannelStore.getChannel(channelId);
    const ids: string[] = [];

    if (!channel) return mentions.map(m => m?.id).filter(Boolean);

    if (Array.isArray(channel.recipients)) {
        ids.push(...channel.recipients);
    } else {
        ids.push(channelId);
    }

    for (const mention of mentions) {
        if (mention?.id && !ids.includes(mention.id)) {
            ids.push(mention.id);
        }
    }

    return ids;
}

let unpatch: () => void;

export default {
    onLoad() {
        unpatch = before("sendMessage", MessageEvents, ([channelId, message]) => {
            const mentions = message?.mentions || [];
            const idsToMatch = getUserID(channelId, mentions);

            const shouldSendSilently =
                storage.alwaysSilent ||
                idsToMatch.some(id => storage.silentList.includes(id));

            if (shouldSendSilently && typeof message.content === "string" && !message.content.startsWith("@silent ")) {
                message.content = `@silent ${message.content}`;
            }
        });

        loadCommands?.();
    },

    onunload() {
        if (unpatch) unpatch();
        unloadCommands?.();
    },

    settings: Settings,
};