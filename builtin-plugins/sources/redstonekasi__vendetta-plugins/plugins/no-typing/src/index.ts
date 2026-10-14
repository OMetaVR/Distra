import { instead } from "@vendetta/patcher";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import { removeChatButton, syncChatButton } from "./chatbutton";

const Typing = findByProps("startTyping");
const patches = ["startTyping", "stopTyping"].map((k) =>
  // Distra: the chat bar button switches hiding off and on.
  instead(k, Typing, (args, original) => (storage.hidden === false ? original(...args) : undefined)),
);

export const onLoad = () => {
  storage.hidden ??= true;
  storage.chatButton ??= true;
  syncChatButton();
};

export const onUnload = () => {
  removeChatButton();
  patches.forEach((unpatch) => unpatch());
};

export const settings = Settings;
