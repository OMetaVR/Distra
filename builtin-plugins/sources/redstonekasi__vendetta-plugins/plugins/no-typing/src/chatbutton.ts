import { storage } from "@vendetta/plugin";

let removeButton: (() => void) | undefined;

/** Adds (or removes) the keyboard button in the chat bar, following the setting. */
export function syncChatButton() {
  removeButton?.();
  removeButton = undefined;
  const chatBar = (window as any).distra?.chatBar;
  if (!chatBar || storage.chatButton === false) return;
  removeButton = chatBar.register({
    id: "no-typing",
    icon: "KeyboardIcon",
    label: "Hide typing indicator",
    // Slashed while your typing is hidden, like Equicord's SilentTyping.
    slashed: () => storage.hidden !== false,
    onPress: () => {
      storage.hidden = storage.hidden === false;
      chatBar.update();
    },
  });
}


export const removeChatButton = () => {
  removeButton?.();
  removeButton = undefined;
};
