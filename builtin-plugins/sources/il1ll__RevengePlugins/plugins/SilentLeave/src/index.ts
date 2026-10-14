import { registerCommand, unregisterAllCommands } from "@vendetta/commands";
import { findByProps } from "@vendetta/metro";
import { before, after, instead } from "@vendetta/patcher";
import { React } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";

const ChannelStore = findByProps("getChannel");
const APIUtils = findByProps("getAPIBaseURL", "del");

/** Leaves a group DM without telling the others, then goes back to the DM list. */
async function leaveSilently(channelId: string) {
  try {
    await APIUtils.del({ url: `/channels/${channelId}`, query: "silent=true" });
    findByProps("transitionTo", "transitionToGuild")?.transitionTo("/channels/@me");
    showToast("Left Group DM successfully.");
  } catch {
    showToast("Failed to leave Group DM.");
  }
}

const loadCommands = () => {
  registerCommand({
    name: "leave silent",
    description: "Leave the current Group DM silently",
    options: [],
    predicate: (ctx) => {
      const channelId = ctx?.channel?.id;
      const channel = ChannelStore.getChannel(channelId);
      return !!channel && channel.type === 3;
    },
    execute: async (_, ctx) => {
      await leaveSilently(ctx.channel.id);
    }
  });
};

// Distra: the "Leave Group" confirmation gets a "Leave silently" button of its own. The sheet's
// leave row remembers which group was pressed, and the next confirmation Discord shows is swapped
// for a three button one (Leave, Leave silently, Cancel) that keeps Discord's own wording.
const ARMED_FOR_MS = 2000;
let armed: { channelId: string; at: number } | undefined;
const unpatches: (() => void)[] = [];
const patchedSheets = new WeakSet<object>();

const isLeaveRow = (node: any) =>
  node?.props && (node.props.variant === "danger" || node.props.isDestructive || node.props.destructive)
  && typeof node.props.onPress === "function" && typeof node.props.label === "string" && /leave/i.test(node.props.label);

function findLeaveRows(node: any, found: any[] = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 20) return found;
  if (Array.isArray(node)) node.forEach((child) => findLeaveRows(child, found, depth + 1));
  else {
    if (isLeaveRow(node)) found.push(node);
    findLeaveRows(node.props?.children, found, depth + 1);
  }
  return found;
}

function showLeaveChoices(config: any, channelId: string) {
  const Alerts = findByProps("openAlert", "dismissAlert");
  const { AlertModal, AlertActionButton } = findByProps("AlertModal", "AlertActionButton") ?? {};
  if (!Alerts || !AlertModal || !AlertActionButton) return false;
  const close = () => Alerts.dismissAlert?.("silent-leave");
  Alerts.openAlert(
    "silent-leave",
    React.createElement(AlertModal, {
      title: config.title,
      content: config.body ?? config.content,
      actions: React.createElement(React.Fragment, null,
        React.createElement(AlertActionButton, { text: config.confirmText ?? "Leave", variant: "destructive", onPress: () => { close(); config.onConfirm?.(); } }),
        React.createElement(AlertActionButton, { text: "Leave silently", variant: "destructive", onPress: () => { close(); leaveSilently(channelId); } }),
        React.createElement(AlertActionButton, { text: config.cancelText ?? "Cancel", variant: "secondary", onPress: () => { close(); config.onCancel?.(); } }),
      ),
    }),
  );
  return true;
}

function patchLeaveConfirmation() {
  const Sheets = findByProps("openLazy", "hideActionSheet");
  const Alerts = findByProps("openLazy", "close", "show");
  if (!Sheets || !Alerts) return;

  unpatches.push(before("openLazy", Sheets, ([component, key]: any[]) => {
    if (key !== "ChannelLongPressActionSheet" || typeof component?.then !== "function") return;
    component.then((module: any) => {
      if (!module || patchedSheets.has(module)) return;
      patchedSheets.add(module);
      unpatches.push(after("default", module, ([props]: any[], tree: any) => {
        const channel = props?.channel;
        if (channel?.type !== 3 || !tree) return;
        for (const row of findLeaveRows(tree)) {
          const press = row.props.onPress;
          row.props.onPress = (...args: any[]) => {
            armed = { channelId: channel.id, at: Date.now() };
            return press(...args);
          };
        }
      }));
    });
  }));

  unpatches.push(instead("show", Alerts, (args: any[], original: (...args: any[]) => any) => {
    const config = args[0];
    if (armed && Date.now() - armed.at < ARMED_FOR_MS && config?.onConfirm) {
      const { channelId } = armed;
      armed = undefined;
      if (showLeaveChoices(config, channelId)) return;
    }
    return original(...args);
  }));
}

export default {
  onLoad() {
    loadCommands();
    patchLeaveConfirmation();
  },
  onUnload() {
    unregisterAllCommands();
    unpatches.forEach((unpatch) => unpatch());
    unpatches.length = 0;
    armed = undefined;
  }
};
