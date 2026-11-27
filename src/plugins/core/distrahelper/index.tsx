// Distra Helper: help messages from mmeta get cards. Port of Distra Desktop's DistraHelper for iOS.
//
//   - A message from mmeta whose last line is a helper marker (see shared.ts) gets one embed per card:
//     a plugin with its state, "check for an update", "open a settings page" or "share your debug
//     info". They're Discord's own embeds, added to the message as its chat row is built, so they look
//     like any other embed. Tapping one opens the plugin's page (toggle, settings), the settings page,
//     or asks before sending debug info.
//   - mmeta gets /plugindisplay, /updateprompt, /settingsprompt and /debugrequest to send them, and
//     /distra-debug and /distra-plugins work in DMs with mmeta (commands.ts).
//
// Each card links to the Distra repository with the action after "#"; Distra catches the tap, and
// anything that doesn't just opens the repository.

import { Alert, Linking } from "react-native";

import { interceptChatTap } from "@/lib/chatRows";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { redrawMessages } from "@/lib/rowRedraw";
import { findByFilePath, findByNameLazy, findByProps, findByStoreName } from "@/metro";
import { onPluginsChanged } from "@/plugins/manager";
import { PluginDetails } from "@/ui/pages/Plugins";

import { definePlugin } from "../types";
import { registerHelperCommands } from "./commands";
import { confirmSendDebugInfo, debugInfo } from "./debug";
import { openPageModal } from "./modal";
import { findPlugin, OWNER_ID, parseMarker, pluginState, SECTIONS, type SectionId, versionLine } from "./shared";

const logger = new Logger("DistraHelper");
let patcher = createPatcher("DistraHelper");
let unregisterCommands: (() => void) | undefined;
let unsubscribe: (() => void) | undefined;

const RowManager = findByNameLazy("RowManager");
const REPO = "https://github.com/OMetaVR/Distra";
const RELEASES = `${REPO}/releases`;
const LINK_PREFIX = `${REPO}#distra-helper:`;

const BLURPLE = 0x5865f2;
const GREEN = 0x23a55a;
const GREY = 0x80848e;

interface Card {
    title: string;
    description: string;
    footer: string;
    color: number;
    action: string;
}

function cardsFor(content: string | undefined): Card[] | null {
    const marker = parseMarker(content);
    if (!marker) return null;
    switch (marker.kind) {
        case "plugin": {
            const names = [...new Set(marker.arg.split(",").map(name => name.trim()).filter(Boolean))].slice(0, 10);
            return names.map(name => {
                const record = findPlugin(name);
                if (!record) return { title: name, description: "This plugin isn't in Distra for iOS.", footer: "Distra plugin · not available", color: GREY, action: `plugin:${name}` };
                const state = pluginState(record);
                return {
                    title: record.manifest.name,
                    description: record.manifest.description ?? "",
                    footer: `Distra plugin · ${state} · tap to manage`,
                    color: record.enabled ? GREEN : GREY,
                    action: `plugin:${name}`,
                };
            });
        }
        case "update":
            return [{ title: "Check for a Distra update", description: `You're on ${versionLine()}.`, footer: "Tap to see Distra's releases", color: BLURPLE, action: "update" }];
        case "open": {
            const section = SECTIONS[marker.arg as SectionId];
            if (!section) return null;
            return [{
                title: `Open ${section.label}`,
                description: section.page ? "Opens the right page in your Distra settings." : `Distra for iOS doesn't have ${section.label}.`,
                footer: section.page ? "Tap to open" : "Not on iOS",
                color: BLURPLE,
                action: `open:${marker.arg}`,
            }];
        }
        case "debug":
            return [{
                title: "Share your debug info",
                description: "Sends your Distra build, Discord build, iOS version and enabled plugins to this chat, after you confirm.",
                footer: "Tap to send",
                color: BLURPLE,
                action: "debug",
            }];
    }
}

/** A card as an API embed, turned into the stored form by Discord's own sanitizer. */
function toEmbed(card: Card, index: number, message: any, sanitize: (...args: any[]) => any) {
    const raw = {
        type: "rich",
        url: `${LINK_PREFIX}${encodeURIComponent(card.action)}`,
        title: card.title,
        description: card.description,
        color: card.color,
        footer: { text: card.footer },
    };
    try {
        return sanitize(message.channel_id, `${message.id}-distra-helper-${index}`, raw);
    } catch (e) {
        logger.warn("Couldn't build a helper card", e);
        return null;
    }
}

function patchRows() {
    const sanitize = findByProps("sanitizeEmbed", "mergeEmbedsOnURL")?.sanitizeEmbed;
    if (typeof sanitize !== "function") return logger.warn("Embed builder not found; helper messages show no cards");
    patcher.before("generate", RowManager.prototype, (args: any[]) => {
        const data = args[0];
        const message = data?.message;
        if (data?.rowType !== 1 || message?.author?.id !== OWNER_ID) return;
        const cards = cardsFor(message.content);
        if (!cards?.length) return;
        const embeds = cards.map((card, index) => toEmbed(card, index, message, sanitize)).filter(Boolean);
        if (!embeds.length) return;
        // A copy: the message record is shared with the message store.
        const copy = Object.assign(Object.create(Object.getPrototypeOf(message)), message, { embeds: [...(message.embeds ?? []), ...embeds] });
        return [{ ...data, message: copy }, ...args.slice(1)];
    });
}

function runAction(action: string, channelId: string | undefined) {
    const [kind, ...rest] = action.split(":");
    const arg = rest.join(":");
    switch (kind) {
        case "plugin": {
            const record = findPlugin(arg);
            if (!record) return Alert.alert(arg, "This plugin isn't in your version of Distra for iOS. Try updating!");
            openPageModal(record.manifest.name, () => <PluginDetails id={record.id} />);
            return;
        }
        case "update":
            return Alert.alert("Check for a Distra update", `You're on ${versionLine()}.\n\nNew builds are published on GitHub.`, [
                { text: "Close", style: "cancel" },
                { text: "Open releases", onPress: () => void Linking.openURL(RELEASES) },
            ]);
        case "open": {
            const section = SECTIONS[arg as SectionId];
            if (!section?.page) return Alert.alert(section?.label ?? "Settings", "Distra for iOS doesn't have this page.");
            void section.page().then(({ default: Page }) => openPageModal(section.label, Page));
            return;
        }
        case "debug":
            if (channelId) confirmSendDebugInfo(channelId);
    }
}

/** A helper card's link in a tap event, wherever the URL sits (plain links and embed titles differ). */
function helperUrl(event: any): string | undefined {
    for (const candidate of [event, event?.data, event?.target, event?.tapLinkData, event?.tapLinkData?.data, event?.nativeEvent]) {
        if (!candidate || typeof candidate !== "object") continue;
        for (const key of ["url", "href", "link", "target"]) {
            const value = candidate[key];
            if (typeof value === "string" && value.startsWith(LINK_PREFIX)) return value;
        }
    }
    return undefined;
}

const currentChannelId = () => findByStoreName("SelectedChannelStore")?.getChannelId?.();

function handleHelperTap(event: any, channelId?: string) {
    const url = helperUrl(event);
    if (!url) return false;
    runAction(decodeURIComponent(url.slice(LINK_PREFIX.length)), channelId ?? currentChannelId());
    return true;
}

/** Taps on a card's link run its action instead of opening the repository. */
function patchTaps() {
    const module = findByFilePath("modules/messages/native/handlers/handleMessagesTapLink.tsx");
    if (typeof module?.handleMessagesTapLink === "function") {
        patcher.instead("handleMessagesTapLink", module, (args: any[], original: (...a: any[]) => any) => {
            const tap = args[0];
            if (handleHelperTap(tap?.tapLinkData, tap?.tapLinkData?.data?.messageChannelId ?? tap?.messageChannel?.id)) return;
            return original(...args);
        });
    }
    // Also before Discord's chat handler, for link kinds that don't reach handleMessagesTapLink.
    interceptChatTap(patcher, "handleTapLink", () => true, event => handleHelperTap(event));
}

/** Plugin cards show whether the plugin is on, so they're redrawn when that changes. */
function redrawHelperMessages() {
    const channelId = findByStoreName("SelectedChannelStore")?.getChannelId?.();
    const messages: any[] = channelId ? findByStoreName("MessageStore")?.getMessages?.(channelId)?._array ?? [] : [];
    const ids = messages.filter(m => m?.author?.id === OWNER_ID && parseMarker(m.content)?.kind === "plugin").map(m => m.id);
    if (ids.length) redrawMessages(channelId, ids);
}

export default definePlugin({
    id: "distra:distra-helper",
    manifest: {
        name: "Distra Helper",
        description: "Shows plugin cards and quick actions under Distra help messages from mmeta, and gives mmeta the commands that send them.",
        authors: [{ name: "Distra" }, { name: "mmeta (Distra Desktop DistraHelper)" }],
        version: "1.0.0",
    },
    enabledByDefault: true,
    start() {
        patcher = createPatcher("DistraHelper");
        patchRows();
        patchTaps();
        unregisterCommands = registerHelperCommands();
        let timer: ReturnType<typeof setTimeout> | undefined;
        unsubscribe = onPluginsChanged(() => {
            clearTimeout(timer);
            timer = setTimeout(redrawHelperMessages, 300);
        });
    },
    stop() {
        patcher.unpatchAll();
        unregisterCommands?.();
        unsubscribe?.();
    },
    api: { debugInfo },
});
