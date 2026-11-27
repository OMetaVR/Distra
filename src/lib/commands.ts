// Slash commands, injected as Discord "built-in" commands.
//
// Commands with a `sectionName` get their own header in the slash picker instead of "Built-In".
// Plugins' commands are named after their plugin automatically (see the flavors). Sections are
// ordered by `sectionOrder` (lowest first; Remote Commands backends use 0-999, plugins default to
// 1000), then by name.
// Discord files every built-in command under BUILT_IN_SECTIONS["-1"] whatever its applicationId,
// so ApplicationCommandIndexStore.query's result is regrouped afterwards: those commands move out of
// the Built-In group into one group per name, placed just before it, each with its own descriptor
// (the header). Commands in other groups (Frequently Used) are left where they are.

import { logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { isLocalOnly, sendLocalMessage } from "@/lib/localMessage";
import { byFilePath, byMethods, waitFor } from "@/metro";
import { commands as commandsModule, messageUtil } from "@/metro/common";

export const ApplicationCommandType = { CHAT: 1, USER: 2, MESSAGE: 3 } as const;
export const ApplicationCommandInputType = { BUILT_IN: 0, BUILT_IN_TEXT: 1, BUILT_IN_INTEGRATION: 2, BOT: 3, PLACEHOLDER: 4 } as const;
export const ApplicationCommandOptionType = {
    SUB_COMMAND: 1, SUB_COMMAND_GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6,
    CHANNEL: 7, ROLE: 8, MENTIONABLE: 9, NUMBER: 10, ATTACHMENT: 11,
} as const;

export interface Command {
    id?: string;
    name: string;
    description: string;
    options?: Array<{ name: string; description: string; type: number; required?: boolean; [k: string]: unknown }>;
    execute(args: any[], ctx: { channel: any; guild: any }): unknown;
    shouldHide?: () => boolean;
    /** Called each time Discord lists the command (the slash picker opening or filtering). */
    onListed?: () => void;
    /** Header to list the command under in the slash picker (default: Discord's "Built-In"). */
    sectionName?: string;
    /** Where the section goes among the others (lower first); default 1000. */
    sectionOrder?: number;
    [key: string]: unknown;
}

let registered: Command[] = [];

export function patchCommands() {
    corePatcher.addCleanup(waitFor(byMethods("getBuiltInCommands"), module => {
        corePatcher.after("getBuiltInCommands", module, ([type], result: any[]) => {
            const types = Array.isArray(type) ? type : [type];
            const listed = registered.filter(command => types.includes(command.type) && !command.shouldHide?.());
            for (const command of listed) {
                try {
                    command.onListed?.();
                } catch (e) {
                    logger.error(`onListed for /${command.name} failed`, e);
                }
            }
            return result.concat(listed);
        });
        logger.info("Patched getBuiltInCommands");
    }));

    corePatcher.addCleanup(waitFor(byFilePath("modules/application_commands/ApplicationCommandIndexStore.tsx"), module => {
        const store = module?.default;
        const owner = store && (Object.prototype.hasOwnProperty.call(store, "query") ? store : Object.getPrototypeOf(store));
        if (typeof owner?.query !== "function") return logger.warn("ApplicationCommandIndexStore.query not found; command sections are off");
        corePatcher.after("query", owner, (_args, result: any) => {
            try {
                return withSections(result);
            } catch (e) {
                logger.error("Grouping commands into sections failed", e);
                return result;
            }
        });
        logger.info("Patched ApplicationCommandIndexStore.query");
    }, { raw: true }));
}

const BUILT_IN_SECTION_ID = "-1";
const DEFAULT_SECTION_ORDER = 1000;
const sectionIds = new Map<string, string>();

/** A stable id per section name, out of the way of Discord's ("-1", "-2") and real application ids. */
const sectionIdFor = (name: string) => {
    let id = sectionIds.get(name);
    if (!id) sectionIds.set(name, id = `-distra-${sectionIds.size + 1}`);
    return id;
};

function withSections(result: any) {
    const groups: any[] | undefined = result?.sectionedCommands;
    const builtInIndex = groups?.findIndex(group => group?.section?.id === BUILT_IN_SECTION_ID) ?? -1;
    if (builtInIndex === -1) return result;
    const builtIn = groups![builtInIndex];
    const named = new Map<string, any>();
    const rest: any[] = [];
    for (const command of builtIn.data ?? []) {
        const name = typeof command?.sectionName === "string" ? command.sectionName : undefined;
        if (!name) {
            rest.push(command);
            continue;
        }
        let group = named.get(name);
        if (!group) named.set(name, group = { ...builtIn, section: { id: sectionIdFor(name), type: builtIn.section.type, name }, data: [], order: Infinity });
        group.order = Math.min(group.order, typeof command.sectionOrder === "number" ? command.sectionOrder : DEFAULT_SECTION_ORDER);
        command.section = group.section;
        group.data.push(command);
    }
    if (!named.size) return result;

    const added = [...named.values()]
        .sort((a, b) => a.order - b.order || a.section.name.localeCompare(b.section.name))
        .map(({ order: _, ...group }) => group);
    const sectionedCommands = [...groups!.slice(0, builtInIndex), ...added, ...(rest.length ? [{ ...builtIn, data: rest }] : []), ...groups!.slice(builtInIndex + 1)];
    const descriptors: any[] = result.descriptors ?? [];
    const descriptorIndex = descriptors.findIndex(descriptor => descriptor?.id === BUILT_IN_SECTION_ID);
    const keptDescriptors = rest.length ? descriptors : descriptors.filter(descriptor => descriptor?.id !== BUILT_IN_SECTION_ID);
    const at = descriptorIndex === -1 ? keptDescriptors.length : descriptorIndex;
    return {
        ...result,
        sectionedCommands,
        descriptors: [...keptDescriptors.slice(0, at), ...added.map(group => group.section), ...keptDescriptors.slice(at)],
    };
}

/** Files commands under `sectionName` (their plugin, usually) unless they chose a section themselves. */
export function inSection<T extends Command>(command: T, sectionName: string | undefined): T {
    if (sectionName && typeof command.sectionName !== "string") command.sectionName = sectionName;
    return command;
}

export function registerCommand(command: Command): () => void {
    // Built-in command ids are negative-ish strings; take the next free one below the lowest.
    let builtIn: Command[];
    try {
        builtIn = commandsModule.getBuiltInCommands(ApplicationCommandType.CHAT, true, false);
    } catch {
        builtIn = commandsModule.getBuiltInCommands(Object.values(ApplicationCommandType), true, false);
    }
    const lowest = Math.min(...[...builtIn, ...registered].map(c => parseInt(c.id ?? "0", 10)).filter(Number.isFinite));
    command.id = String((Number.isFinite(lowest) ? lowest : 0) - 1);

    command.applicationId ??= "-1";
    command.type ??= ApplicationCommandType.CHAT;
    command.inputType = ApplicationCommandInputType.BUILT_IN;
    command.displayName ??= command.name;
    command.untranslatedName ??= command.name;
    command.displayDescription ??= command.description;
    command.untranslatedDescription ??= command.description;
    for (const option of command.options ?? []) {
        option.displayName ??= option.name;
        option.displayDescription ??= option.description;
    }

    // Commands may return a message object to send.
    const execute = command.execute;
    command.execute = (args, ctx) => {
        Promise.resolve()
            .then(() => execute.call(command, args, ctx))
            .then(result => {
                if (!result || typeof result !== "object") return;
                // `{ type: 4, data }` / flags 64 replies are for you only; anything else is sent as a message.
                if (isLocalOnly(result)) sendLocalMessage(ctx.channel.id, result);
                else messageUtil.sendMessage(ctx.channel.id, result);
            })
            .catch(e => logger.error(`Command /${command.name} failed`, e));
    };

    registered.push(command);
    return () => unregisterCommand(command.id!);
}

/** Removes a command by id (or name). */
export function unregisterCommand(idOrName: string) {
    const before = registered.length;
    registered = registered.filter(c => c.id !== idOrName && c.name !== idOrName);
    return registered.length !== before;
}
