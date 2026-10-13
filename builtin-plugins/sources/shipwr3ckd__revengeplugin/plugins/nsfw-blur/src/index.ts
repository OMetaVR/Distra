import { findByName, findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import Settings from "./Settings";

let patches: (() => void)[] = [];

export default {
  onLoad() {
    const createMessageContent = findByName("createMessageContent", false);
    const getChannel = findByProps("getChannel").getChannel;

    patches.push(
      before("default", createMessageContent, (args) => {
        const content = args[0];
        if (!content?.message?.channel_id || !content?.options) return;

        const channel = getChannel(content.message.channel_id);
        if (!channel?.nsfw_) return;

        content.options.inlineEmbedMedia = false;
        content.options.shouldObscureSpoiler = true;

        const message = content.message;
        if (!message?.attachments?.length) return;

        for (const attachment of message.attachments) {
          attachment.spoiler = true;
        }
      })
    );
  },

  onUnload() {
    for (const unpatch of patches) unpatch();
    patches = [];
  },

  settings: Settings,
};