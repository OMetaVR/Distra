// Slash commands, injected as Discord "built-in" commands.

import { logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { isLocalOnly, sendLocalMessage } from "@/lib/localMessage";
import { byMethods, waitFor } from "@/metro";
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
    [key: string]: unknown;
}

let registered: Command[] = [];

export function patchCommands() {
    corePatcher.addCleanup(waitFor(byMethods("getBuiltInCommands"), module => {
        corePatcher.after("getBuiltInCommands", module, ([type], result: any[]) => {
            const types = Array.isArray(type) ? type : [type];
            return result.concat(registered.filter(command =>
                types.includes(command.type) && !command.shouldHide?.()));
        });
        logger.info("Patched getBuiltInCommands");
    }));
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
