// The helper commands. mmeta gets the ones that send helper messages (same text as Distra Desktop's, so
// cards show on both clients); /distra-debug and /distra-plugins work for anyone in a DM with mmeta.

import { ApplicationCommandOptionType, type Command, registerCommand } from "@/lib/commands";
import { sendLocalMessage } from "@/lib/localMessage";
import { findByStoreName } from "@/metro";

import { debugInfo, sendDebugInfo } from "./debug";
import { findPlugin, isOwner, OWNER_ID, SECTIONS, type SectionId, shareName, suggestions, withNote } from "./shared";

const option = (args: any[], name: string): string | undefined => args?.find((arg: any) => arg?.name === name)?.value;

const noteOption = { name: "note", description: "Text to put above it", type: ApplicationCommandOptionType.STRING, required: false };

/** Whether the open chat is a DM (or group DM) with mmeta. */
function inDmWithOwner() {
    const channelId = findByStoreName("SelectedChannelStore")?.getChannelId?.();
    const channel = channelId ? findByStoreName("ChannelStore")?.getChannel?.(channelId) : undefined;
    return (channel?.type === 1 || channel?.type === 3) && (channel.recipients ?? []).includes(OWNER_ID);
}

const ownerCommands: Command[] = [
    {
        name: "plugindisplay",
        description: "Send plugin cards that Distra users can toggle right in chat",
        options: [
            { name: "plugins", description: "Plugin names, separated by commas", type: ApplicationCommandOptionType.STRING, required: true },
            noteOption,
        ],
        execute(args, ctx) {
            const requested = (option(args, "plugins") ?? "").split(",").map(name => name.trim()).filter(Boolean);
            const found = requested.map(findPlugin);
            const missing = requested.filter((_, i) => !found[i]);
            if (missing.length) {
                const hints = missing.map(name => {
                    const close = suggestions(name);
                    return `**${name}**${close.length ? `: did you mean ${close.join(", ")}?` : ""}`;
                });
                sendLocalMessage(ctx.channel.id, `Couldn't find:\n${hints.join("\n")}`);
                return;
            }
            const records = [...new Map(found.map(record => [record!.id, record!])).values()];
            const lines = records.map(record => `**${shareName(record)}** · ${record.manifest.description ?? ""}`.trim());
            return { content: withNote(option(args, "note"), `${lines.join("\n")}\n-# Distra · plugin:${records.map(shareName).join(",")}`) };
        },
    },
    {
        name: "updateprompt",
        description: "Ask a Distra user to update, with a button to their updater",
        options: [noteOption],
        execute: args => ({ content: withNote(option(args, "note") ?? "Your Distra might be out of date.", "-# Distra · update") }),
    },
    {
        name: "settingsprompt",
        description: "Send a button that opens a page of a Distra user's settings",
        options: [
            {
                name: "section",
                description: "Which page to open",
                type: ApplicationCommandOptionType.STRING,
                required: true,
                choices: Object.entries(SECTIONS).map(([value, { label }]) => ({ name: value, displayName: label, value })),
            },
            noteOption,
        ],
        execute(args) {
            const section = (option(args, "section") ?? "distra") as SectionId;
            return { content: withNote(option(args, "note"), `-# Distra · open:${section in SECTIONS ? section : "distra"}`) };
        },
    },
    {
        name: "debugrequest",
        description: "Ask a Distra user to share their debug info with one tap",
        options: [noteOption],
        execute: args => ({ content: withNote(option(args, "note") ?? "Could you send me your Distra debug info?", "-# Distra · debug") }),
    },
];

const supportCommands: Command[] = [
    {
        name: "distra-debug",
        description: "Send your Distra debug info",
        execute(_args, ctx) {
            sendDebugInfo(ctx.channel.id);
        },
    },
    {
        name: "distra-plugins",
        description: "Send your enabled Distra plugins",
        execute: () => ({ content: "```\n" + (debugInfo().pluginList.slice(0, 1990) || "No plugins enabled") + "\n```" }),
    },
];

export function registerHelperCommands() {
    const unregister = [
        ...ownerCommands.map(command => registerCommand({ ...command, sectionName: "Distra Helper", shouldHide: () => !isOwner() })),
        ...supportCommands.map(command => registerCommand({ ...command, sectionName: "Distra Helper", shouldHide: () => !isOwner() && !inDmWithOwner() })),
    ];
    return () => unregister.forEach(fn => fn());
}
