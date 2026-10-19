// Block Keywords: messages containing words (or regular expressions) you choose are treated as if
// their author was blocked, collapsing into Discord's own "blocked messages" row you can tap to
// show. Port of Equicord's BlockKeywords (GPL-3.0-or-later, by catcraft):
//
//   - ChannelMessages.commit marks matching messages `blocked`, which the chat (createChannelStream)
//     groups like a blocked user's messages;
//   - "Ignore new matching messages" skips MessageStore's and ReadStateStore's MESSAGE_CREATE handlers
//     for them, so they don't arrive live, mark the channel unread or move the new-messages bar.
//
// Everything is local: nothing is blocked on Discord's side.

import { subscribe } from "@/core/storage";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByProps, findByStoreName } from "@/metro";
import { FluxDispatcher } from "@/metro/common";

import { definePlugin } from "../types";
import { compile, containsBlockedKeywords, hasKeywords } from "./matcher";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";

const logger = new Logger("BlockKeywords");
let patcher = createPatcher("BlockKeywords");
let unsubscribe: (() => void) | undefined;

/** Ids of messages this plugin marked blocked (so they can be unmarked again). */
const blockedByUs = new Set<string>();

const ChannelMessages = () => findByProps("_channelMessages", "commit");

/** `list` with every message's `blocked` flag set from the keywords. Returns `list` when nothing changes. */
function applyKeywords(list: any, enabled = true) {
    if (!list || typeof list.map !== "function" || typeof list.reset !== "function") return list;
    let changed = false;
    const messages = list.map((message: any) => {
        const ours = blockedByUs.has(message.id);
        const match = enabled && containsBlockedKeywords(message);
        const blocked = match || (!!message.blocked && !ours);
        if (match) blockedByUs.add(message.id);
        else if (ours) blockedByUs.delete(message.id);
        if (blocked === !!message.blocked || typeof message.set !== "function") return message;
        changed = true;
        return message.set("blocked", blocked);
    });
    return changed ? list.reset(messages) : list;
}

/** Re-checks every loaded channel (after the keywords or options changed). */
function refreshAll(enabled = true) {
    const Messages = ChannelMessages();
    if (!Messages) return;
    let touched = false;
    Messages.forEach((list: any) => {
        const next = applyKeywords(list, enabled);
        if (next !== list) {
            Messages.commit(next);
            touched = true;
        }
    });
    if (touched) findByStoreName("MessageStore")?.emitChange?.();
}

function patchCommit() {
    const Messages = ChannelMessages();
    if (!Messages) return logger.warn("ChannelMessages not found; keywords won't hide loaded messages");
    patcher.before("commit", Messages, (args: any[]) => {
        if (!hasKeywords() && !blockedByUs.size) return;
        const next = applyKeywords(args[0]);
        if (next !== args[0]) return [next, ...args.slice(1)];
    });
}

/** The dispatcher caches each action's handler list; dropping it makes it pick up patched handlers. */
const dropHandlerCache = () => void delete FluxDispatcher?._actionHandlers?._orderedActionHandlers?.MESSAGE_CREATE;

/**
 * Skips a store's MESSAGE_CREATE handler for matching messages. Handlers live per store in the
 * dispatcher's dependency graph (`nodes[id].actionHandler[type]`).
 */
function skipNewMessages(storeName: string) {
    const nodes = FluxDispatcher?._actionHandlers?._dependencyGraph?.nodes ?? {};
    const handlers = (Object.values(nodes) as any[]).find(node => node?.name === storeName)?.actionHandler;
    if (typeof handlers?.MESSAGE_CREATE !== "function") return logger.warn(`${storeName}'s MESSAGE_CREATE handler not found`);
    patcher.addCleanup(dropHandlerCache);
    dropHandlerCache();
    patcher.instead("MESSAGE_CREATE", handlers, (args: any[], original: (...a: any[]) => any) => {
        const message = args[0]?.message;
        // Your own messages always go through: skipping one would leave its pending copy unsent.
        const own = message?.author?.id && message.author.id === findByStoreName("UserStore")?.getCurrentUser?.()?.id;
        if (settings.ignoreNewMessages && !own && containsBlockedKeywords(message)) return false;
        return original(...args);
    });
}

export default definePlugin({
    id: "distra:block-keywords",
    manifest: {
        name: "Block Keywords",
        description: "Messages containing words you choose collapse like a blocked user's messages. Regular expressions, case sensitivity and more in the settings.",
        authors: [{ name: "Distra" }, { name: "catcraft (Equicord BlockKeywords)" }],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        compile();
        patcher = createPatcher("BlockKeywords");
        patchCommit();
        skipNewMessages("MessageStore");
        skipNewMessages("ReadStateStore");

        let timer: ReturnType<typeof setTimeout> | undefined;
        unsubscribe = subscribe(settings, () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                compile();
                refreshAll();
            }, 300);
        });
        refreshAll();
    },

    stop() {
        unsubscribe?.();
        unsubscribe = undefined;
        patcher.unpatchAll();
        refreshAll(false);
        blockedByUs.clear();
    },

    SettingsComponent: SettingsPage,
    api: { containsBlockedKeywords, getSettings: () => settings },
});
