import { registerCommand, unregisterAllCommands } from "@vendetta/commands";
import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import Settings from "./settings";

const APIUtils = findByProps("getAPIBaseURL", "get", "post", "del");

function request(method: "POST" | "DELETE", body?: any) {
  if (method === "POST") {
    return APIUtils.post({
      url: "/hypesquad/online",
      body
    });
  }

  return APIUtils.del({
    url: "/hypesquad/online"
  });
}

async function applyHouse(args: any) {
  const raw =
    args?.type ??
    args?.[0]?.value ??
    args?.[0] ??
    args;

  const value = Number(raw);

  if (!Number.isInteger(value) || ![0, 1, 2, 3].includes(value)) {
    showToast("Use 0, 1, 2, 3");
    return;
  }

  try {
    if (value === 0) {
      await request("DELETE");
      showToast("HypeSquad removed");
      return;
    }

    await request("POST", { house_id: value });

    const names: Record<number, string> = {
      1: "Bravery",
      2: "Brilliance",
      3: "Balance"
    };

    showToast(`HypeSquad set to ${names[value]}`);
  } catch {
    showToast("Request failed");
  }
}

export const loadCommands = () => {
  registerCommand({
    name: "hypesquad",
    description: "Apply or remove your HypeSquad badge",
    options: [
      {
        name: "type",
        description: "0 remove | 1 bravery | 2 brilliance | 3 balance",
        type: 4,
        required: true
      }
    ],
    execute: (args) => applyHouse(args)
  });
};

export const unloadCommands = () => unregisterAllCommands();

export default {
  onLoad() {
    loadCommands();
  },
  onUnload() {
    unloadCommands();
  },
  settings: Settings
};
