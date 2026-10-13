import { registerCommand, unregisterAllCommands } from "@vendetta/commands";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";

const ChannelStore = findByProps("getChannel");

export const loadCommands = () => {
  registerCommand({
    name: "silent",
    description: "Toggle silent messaging",
    options: [],
    execute: (_, ctx) => {
      const channelId = ctx?.channel?.id;
      const channel = ChannelStore.getChannel(channelId);

      const userId = Array.isArray(channel?.recipients)
        ? channel.recipients.find((id) => id !== channel?.ownerId)
        : channel?.id;

      if (!userId) {
        showToast("Failed to get user ID for this DM/group.", getAssetIDByName("failure-header"));
        return;
      }

      storage.silentList ??= [];
      const idx = storage.silentList.indexOf(userId);
      const isAdding = idx === -1;

      if (isAdding) {
        storage.silentList.push(userId);
        showToast("Added to silent list.", getAssetIDByName("console_detect_success"));
      } else {
        storage.silentList.splice(idx, 1);
        showToast("Removed from silent list.", getAssetIDByName("ic_trash_24px"));
      }

      return;
    },
  });
};

export const unloadCommands = () => unregisterAllCommands();