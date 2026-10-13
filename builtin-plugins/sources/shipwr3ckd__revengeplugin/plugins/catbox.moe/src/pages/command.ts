import { registerCommand } from "@vendetta/commands";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";
import { setCloseDuration } from "../lib/state";
import { roundDuration } from "../lib/utils";

let unregister: (() => void) | null = null;

export function loadCommand() {
  if (unregister) return;

  const commandName = (storage.commandName || "litterbox").replace(/^\//, "");

  unregister = registerCommand({
    name: commandName,
    description: "Set Litterbox duration for the next upload (in hours)",
    options: [
      {
        name: "duration",
        description: "Duration (e.g., 1, 12, 24, 72)",
        type: 3,
        required: false,
      },
    ],
    execute(args) {
      const input = args[0]?.value ?? "";
      const num = parseInt(input);

      if (isNaN(num)) return;

      const rounded = roundDuration(num);
      setCloseDuration(`${rounded}h`);
      showToast(`Duration set to ${rounded}h for the next upload.`);
    },
  });

  console.log(`[catbox.moe] Registered /${commandName} command`);
}

export function unloadCommand() {
  unregister?.();
  unregister = null;
}