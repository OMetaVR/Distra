import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";
import { clipboard } from "@vendetta/metro/common";

let unpatches = [];
let gifPickerActive = false;

try {
  const gifModule = findByProps("trackSelectGIF");

  if (gifModule?.trackSelectGIF) {
    unpatches.push(
      instead("trackSelectGIF", gifModule, (args, orig) => {
        gifPickerActive = true;
        setTimeout(() => {
          gifPickerActive = false;
        }, 100);
        return orig(...args);
      }),
    );
  }

  const messageModule = findByProps("sendMessage");

  if (!messageModule?.sendMessage) {
    throw new Error("sendMessage not found");
  }

  unpatches.push(
    instead("sendMessage", messageModule, (args, orig) => {
      const [channelId, message, ...rest] = args;

      const content = message?.content?.trim();

      const isJustUrl =
        content &&
        content.startsWith("http") &&
        !content.includes(" ") &&
        !content.includes("\n");

      const isGifUrl =
        isJustUrl &&
        (content.endsWith(".gif") ||
          content.includes("cdn.discordapp.com/attachments") ||
          content.includes("tenor.com") ||
          content.includes("giphy.com") ||
          content.includes("klipy.com"));

      if (isGifUrl && gifPickerActive) {
        clipboard.setString(content);
        gifPickerActive = false;
        return;
      }

      return orig(...args);
    }),
  );
} catch (error) {
  console.error("Plugin failed:", error);
}

export const onUnload = () => {
  unpatches.forEach((u) => u());
};
