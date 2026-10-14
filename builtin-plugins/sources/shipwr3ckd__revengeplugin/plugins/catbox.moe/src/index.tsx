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

    // Distra: no warm-up. It uploaded a junk file to catbox and litterbox on every launch, which
    // litterbox now answers with 403; the first real upload works without it.
    void warmUpUploader;
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