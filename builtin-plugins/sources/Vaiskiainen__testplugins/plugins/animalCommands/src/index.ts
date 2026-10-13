import { registerCommand } from "@vendetta/commands";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";
import Settings from "./Settings";
import i18n from "./i18n";
import {
  ensureApiDefaults,
  ensureCommandDefaults,
  getAvailableAnimals,
  getSelectedApi,
  isCommandEnabled,
} from "./animalData";

const CommandType = { CHAT: 1 } as const;
const CommandInputType = { BUILT_IN: 1 } as const;

const logWarn = (...args: any[]) => console.warn("[AnimalCommands]", ...args);
const formatError = (err: any) => err?.message || String(err);

const getMessageActions = () => {
  const g = (globalThis as any);
  if (g?.MessageActions && typeof g.MessageActions === "object") return g.MessageActions;
  const bySendOnly = findByProps("sendMessage");
  if (bySendOnly) return bySendOnly;
  const bySendReceive = findByProps("sendMessage", "receiveMessage");
  if (bySendReceive) return bySendReceive;
  const byCreate = findByProps("createMessage", "getMessages");
  if (byCreate) return byCreate;
  return null;
};

const sendMessageAggressive = async (
  channelId: string,
  content: string
): Promise<{ ok: boolean; method?: string }> => {
  const MA = getMessageActions();
  if (!MA) return { ok: false };

  const msgObj = { content };
  const nonce = Date.now().toString();

  const attempts: { fn: () => any; name: string }[] = [
    { fn: () => MA?.sendMessage?.(channelId, msgObj), name: "MA.sendMessage(channelId, msgObj)" },
    { fn: () => MA?.sendMessage?.(channelId, msgObj, true), name: "MA.sendMessage(channelId, msgObj, true)" },
    { fn: () => MA?.sendMessage?.(channelId, msgObj, undefined, { nonce }), name: "MA.sendMessage(channelId,msg,undefined,{nonce})" },
    { fn: () => MA?.createMessage?.(channelId, msgObj), name: "MA.createMessage(channelId, msgObj)" },
    { fn: () => MA?.createMessage?.(channelId, content), name: "MA.createMessage(channelId, content)" },
    { fn: () => MA?.createMessage?.(channelId, msgObj, undefined, { nonce }), name: "MA.createMessage(channelId,msg,undefined,{nonce})" },
    { fn: () => MA?.sendMessage?.(channelId, content), name: "MA.sendMessage(channelId, content)" },
    { fn: () => MA?.sendMessage?.(channelId, content, true), name: "MA.sendMessage(channelId, content, true)" },
    { fn: () => (MA.default?.createMessage ? MA.default.createMessage(channelId, msgObj) : undefined), name: "MA.default.createMessage" },
    { fn: () => (MA?.dispatch ? MA.dispatch({ type: "CREATE_MESSAGE", channelId, message: msgObj }) : undefined), name: "MA.dispatch(CREATE_MESSAGE)" },
  ];

  for (const attempt of attempts) {
    try {
      const res = attempt.fn();
      if (res && typeof (res as any).then === "function") {
        await res;
      }
      return { ok: true, method: attempt.name };
    } catch (err) {
    }
  }

  return { ok: false };
};

const fetchJson = async (url: string, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchFinalUrl = async (url: string, timeoutMs = 8000): Promise<string> => {
  const headController = new AbortController();
  const headTimeoutId = setTimeout(() => headController.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: headController.signal,
    });
    if (res.ok && res.url) {
      return res.url;
    }
  } catch {
  } finally {
    clearTimeout(headTimeoutId);
  }

  const getController = new AbortController();
  const getTimeoutId = setTimeout(() => getController.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: getController.signal,
    });
    if (res.ok && res.url) return res.url;
  } finally {
    clearTimeout(getTimeoutId);
  }

  return url;
};
const deliverContent = async (ctx: any, content: string) => {
  const channelId = ctx?.channel?.id ?? ctx?.channelId ?? ctx?.message?.channel_id;

  if (channelId) {
    const result = await sendMessageAggressive(channelId, content);
    if (result.ok) return null;
  }

  return { content };
};

let unregisters: Array<() => void> = [];

const unregisterAll = () => {
  for (const unreg of unregisters) unreg?.();
  unregisters = [];
};

const registerAll = () => {
  unregisterAll();
  const available = getAvailableAnimals(storage);
  const enabled = available.filter((animal) => isCommandEnabled(storage, animal));
  unregisters = enabled.map((animal) =>
    registerCommand({
      name: animal.name,
      description: i18n.t(animal.description),
      displayName: i18n.t(animal.displayName),
      displayDescription: i18n.t(animal.description),
      options: [],
      applicationId: "-1",
      id: animal.id,
      inputType: CommandInputType.BUILT_IN,
      type: CommandType.CHAT,
      execute: async (_args, ctx) => {
        try {
          if (!isCommandEnabled(storage, animal)) {
            showToast(i18n.t("toasts.command_disabled"));
            return null;
          }

          const api = getSelectedApi(storage, animal);
          if (api.directUrl) {
            let finalUrl = api.directUrl;
            if (api.cacheBust) {
              try {
                const url = new URL(finalUrl);
                url.searchParams.set("t", Date.now().toString());
                finalUrl = url.toString();
              } catch (err) {
                logWarn("directUrl:cacheBust failed", animal.name, formatError(err));
              }
            }

            if (api.resolveFinalUrl) {
              try {
                finalUrl = await fetchFinalUrl(finalUrl);
              } catch (err) {
                logWarn("directUrl:resolveFinalUrl failed", animal.name, formatError(err));
              }
            }

            return await deliverContent(ctx, finalUrl);
          }

          if (!api.endpoint || !api.parse) {
            showToast(i18n.t("toasts.api_misconfigured"));
            return null;
          }

          const data = await fetchJson(api.endpoint);
          const parsed = api.parse(data);
          if (!parsed.url) {
            showToast(i18n.t("toasts.no_image"));
            return null;
          }

          const caption = parsed.caption ? `${parsed.caption}\n` : "";
          const payload = `${caption}${parsed.url}`;
          return await deliverContent(ctx, payload);
        } catch (err) {
          showToast(i18n.t("toasts.fetch_failed"));
          return null;
        }
      },
    })
  );
};

export default {
  onLoad() {
    ensureApiDefaults(storage);
    ensureCommandDefaults(storage);
    registerAll();

    (globalThis as any).__animalCommandsReload = () => {
      registerAll();
    };
  },

  onUnload() {
    unregisterAll();
    try {
      delete (globalThis as any).__animalCommandsReload;
    } catch { }
  },

  settings: Settings,
};
