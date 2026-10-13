import { implementPlugin, patcher } from "@lib";

import { getByProps } from "enmity/metro";

import Settings from "./components/Settings";

const typingModule = getByProps("startTyping");

implementPlugin({
  onStart() {
    patcher.instead(typingModule, "startTyping", () => { });
    patcher.instead(typingModule, "stopTyping", () => { });
  },

  onStop() {
    patcher.unpatchAll();
  },

  SettingsPanel({ settings }) {
    return <Settings settings={settings} />;
  }
});
