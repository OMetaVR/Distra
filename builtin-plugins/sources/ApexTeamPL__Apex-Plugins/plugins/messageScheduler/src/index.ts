import { registerCommand, unregisterCommand } from "@vendetta/commands";
import { showToast } from "@vendetta/ui/toasts";
import { findByProps } from "@vendetta/metro";
import { logger } from "@vendetta";

const MessageActions = findByProps("sendMessage", "receiveMessage");
const Clyde = findByProps("sendBotMessage");

let timeoutIds: Record<string, NodeJS.Timeout> = {};
let messageQueue: Record<string, { content: string; at: number }> = {};
let commandSchedule, commandScheduled, commandCancelScheduled;

function schedule(channelId: string, content: string, at: number): string {
  const id = `${channelId}:${at}`;
  const delay = at - Date.now();
  messageQueue[id] = { content, at };

  timeoutIds[id] = setTimeout(() => {
    const realMessage = content;
    const fixNonce = Date.now().toString();
    MessageActions.sendMessage(channelId, { content: realMessage }, void 0, {nonce:fixNonce});
    delete timeoutIds[id];
    delete messageQueue[id];
    showToast("Scheduled message sent.");
  }, delay);

  return id;
}

function cancelAll() {
  Object.values(timeoutIds).forEach(clearTimeout);
  timeoutIds = {};
  messageQueue = {};
}

function parseScheduledTimeExtended(timeStr: string): number {
  const now = new Date();
  timeStr = timeStr.toLowerCase();

  const durRegex = /(\d+)(h|m|s)/g;
  let durationMs = 0;
  let durMatch;
  while ((durMatch = durRegex.exec(timeStr)) !== null) {
    const val = parseInt(durMatch[1]);
    const unit = durMatch[2];
    if (unit === "h") durationMs += val * 3600 * 1000;
    else if (unit === "m") durationMs += val * 60 * 1000;
    else if (unit === "s") durationMs += val * 1000;
  }
  if (durationMs > 0) return Date.now() + durationMs;

  const timeRegex = /^(\d{1,2}):(\d{2})(am|pm)?$/;
  const timeMatch = timeStr.match(timeRegex);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const ampm = timeMatch[3];

    if (ampm) {
      if (ampm === "pm" && hours < 12) hours += 12;
      else if (ampm === "am" && hours === 12) hours = 0;
    }

    const scheduled = new Date(now);
    scheduled.setHours(hours, minutes, 0, 0);

    if (scheduled.getTime() <= now.getTime()) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    return scheduled.getTime();
  }
  
  return 0;
}

export function onLoad() {
  commandSchedule = registerCommand({
    name: "schedule",
    displayName: "schedule",
    description: "Schedule a message after a delay or at a time",
    options: [
      {
        name: "time",
        description: "Delay (e.g. 10s, 1h30m) or time (3:30pm, 15:30)",
        type: 3,
        required: true,
      },
      {
        name: "message",
        description: "Message to send",
        type: 3,
        required: true,
      },
    ],
    execute: (args, ctx) => {
      const channelId = ctx.channel.id;
      const timeStr = args[0]?.value;
      const message = args[1]?.value;

      if (typeof timeStr !== "string" || timeStr.trim() === "") {
        return Clyde.sendBotMessage(channelId, "Invalid time value!");
      }

      if (typeof message !== "string" || message.trim() === "") {
        return Clyde.sendBotMessage(channelId, "Message cannot be empty!");
      }

      const at = parseScheduledTimeExtended(timeStr);
      if (at === 0 || at <= Date.now()) {
        return Clyde.sendBotMessage(channelId, "Invalid or past time specified!");
      }

      schedule(channelId, message, at);
      const secondsLeft = Math.round((at - Date.now()) / 1000);
      Clyde.sendBotMessage(channelId, `Scheduled message in ${secondsLeft}s.`);
    },
  });

  // REJESTRACJA /scheduled
  commandScheduled = registerCommand({
    name: "scheduled",
    displayName: "scheduled",
    description: "List scheduled messages",
    execute: (_args, ctx) => {
      const channelId = ctx.channel.id;
      const list = Object.entries(messageQueue).map(([id, val]) => {
        const secondsLeft = Math.round((val.at - Date.now()) / 1000);
        return `• **In ${secondsLeft}s** → ${val.content}`;
      });
      if (list.length === 0) {
        Clyde.sendBotMessage(channelId, "No scheduled messages.");
      } else {
        Clyde.sendBotMessage(channelId, `Scheduled messages:\n${list.join("\n")}`);
      }
    },
  });

  // REJESTRACJA /cancel-scheduled
  commandCancelScheduled = registerCommand({
    name: "cancel-scheduled",
    displayName: "cancel-scheduled",
    description: "Cancel all scheduled messages",
    execute: (_args, ctx) => {
      const channelId = ctx.channel.id;
      cancelAll();
      Clyde.sendBotMessage(channelId, "All scheduled messages cancelled.");
    },
  });

}

export function onUnload() {
  cancelAll();
  unregisterCommand(commandSchedule);
  unregisterCommand(commandScheduled);
  unregisterCommand(commandCancelScheduled);
}
