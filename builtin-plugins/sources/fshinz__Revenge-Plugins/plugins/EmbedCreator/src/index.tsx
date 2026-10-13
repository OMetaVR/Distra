import { metro, patcher } from "@vendetta";
import EmbedModal from "./EmbedModal";

const Navigation = metro.findByProps("push", "pop");
const Navigator = metro.findByName("Navigator") ?? metro.findByProps("Navigator")?.Navigator;
const modalCloseButton =
  metro.findByProps("getRenderCloseButton")?.getRenderCloseButton ??
  metro.findByProps("getHeaderCloseButton")?.getHeaderCloseButton;

// Locate Message Actions module
const MessageActions = metro.findByProps("sendMessage", "sendBotMessage");
const SelectedChannelStore = metro.findByProps("getChannelId", "getVoiceChannelId");

let unpatchSend: (() => void) | null = null;

export function openEmbedCreator(): void {
  const currentChannelId = SelectedChannelStore?.getChannelId();
  if (!currentChannelId) return;

  if (!Navigation?.push || !Navigator) return;

  Navigation.push(() => (
    <Navigator
      initialRouteName="EmbedCreatorModal"
      goBackOnBackPress
      screens={{
        EmbedCreatorModal: {
          title: "Embed Builder",
          headerLeft: modalCloseButton?.(() => Navigation.pop()),
          render: () => (
            <EmbedModal
              onSend={(formattedText) => {
                if (MessageActions?.sendMessage) {
                  MessageActions.sendMessage(currentChannelId, {
                    content: formattedText,
                  });
                }
              }}
            />
          ),
        },
      }}
    />
  ));
}

export default {
  onLoad: () => {
    // Intercept chat command shortcut if typed directly in chat box: !embed
    if (MessageActions) {
      unpatchSend = patcher.before("sendMessage", MessageActions, (args) => {
        const [channelId, message] = args;
        if (message?.content?.trim() === "!embed") {
          message.content = ""; // Clear trigger text
          setTimeout(() => openEmbedCreator(), 50);
        }
      });
    }
  },
  onUnload: () => {
    if (unpatchSend) unpatchSend();
  },
};
