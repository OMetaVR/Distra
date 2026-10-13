import { warmUpUploader } from "./lib/warmup";
import settings from "./pages/settings";
import { loadCommand, unloadCommand } from "./pages/command";

import {
  ensureDefaultSettings,
  patchUploader,
  patchMessageSender,
} from "./handler";

let unpatches: (() => void)[] = [];

export default {
  onLoad() {
    ensureDefaultSettings();
    loadCommand();

    unpatches.push(patchUploader());
    unpatches.push(patchMessageSender());

    warmUpUploader();
    console.log("[catbox.moe] Plugin loaded.");
    this.settings = settings;
  },

  onUnload() {
    unloadCommand();
    unpatches.forEach((u) => u());
    console.log("[catbox.moe] Plugin unloaded.");
  },

  settings,
};