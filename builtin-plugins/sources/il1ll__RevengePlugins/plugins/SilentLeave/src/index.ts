import { registerCommand, unregisterAllCommands } from "@vendetta/commands";
import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";

const ChannelStore = findByProps("getChannel");
const APIUtils = findByProps("getAPIBaseURL", "del");

const loadCommands = () => {
  registerCommand({
    name: "leave silent",
    description: "Leave the current Group DM silently",
    options: [],
    predicate: (ctx) => {
      const channelId = ctx?.channel?.id;
      const channel = ChannelStore.getChannel(channelId);
      return !!channel && channel.type === 3;
    },
    execute: async (_, ctx) => {
      try {
        await APIUtils.del({
          url: `/channels/${ctx.channel.id}`,
          query: "silent=true"
        });
        showToast("Left Group DM successfully.");
      } catch {
        showToast("Failed to leave Group DM.");
      }
    }
  });
};

export default {
  onLoad() {
    loadCommands();
  },
  onUnload() {
    unregisterAllCommands();
  }
};
