// Remote Commands: slash commands defined and run by external backends (docs/REMOTE_COMMANDS.md).
// The plugin holds no command logic. For each configured backend it loads the manifest, registers
// every command as a built-in command, fills autocomplete options from the backend, and on run sends
// the options (and the message being replied to) to the backend and carries out its reply.
//
// - Subcommands become separate built-in commands named "group sub", the way plugins already do it.
// - Each backend section becomes a header in the slash picker, labelled "<backend> · <section>",
//   ahead of plugin sections.
// - Autocomplete options are registered as fixed `choices`, refreshed from the backend each time
//   Discord lists the command (the picker opening or filtering), since built-in commands have no
//   autocomplete round trip of their own.

import { type Command, registerCommand } from "@/lib/commands";
import { sendLocalMessage } from "@/lib/localMessage";
import { Logger } from "@/lib/logger";
import { UserStore } from "@/metro/common";

import { clearPendingReply, copyText, openUrl, pendingReply, react, replyContextOf, sendFile, sendText, setStatus } from "./discord";
import { type Action, BackendError, type CallContext, execute, fetchChoices, fetchManifest, type Manifest, type RemoteCommand, type RemoteOption, resolveUrl, type Result, type Target } from "./protocol";
import { type Backend, settings } from "./settings";

const logger = new Logger("RemoteCommands");
const CHOICES_REFRESH_MS = 3_000;
const SUB_COMMAND = 1;
const SUB_COMMAND_GROUP = 2;

/** One registered command, as the settings page lists it. */
export interface ListedCommand {
    name: string;
    description: string;
    section: string;
}

export interface BackendState {
    status: "loading" | "ready" | "error";
    error?: string;
    manifest?: Manifest;
    commands: ListedCommand[];
    /** Commands this backend couldn't register because another one already has the name. */
    skipped: string[];
}

const states = new Map<string, BackendState>();
const unregisters = new Map<string, Array<() => void>>();
const listeners = new Set<() => void>();
let running = false;

export async function startAll() {
    running = true;
    await Promise.all(settings.backends.map(loadBackend));
}

export function stopAll() {
    running = false;
    for (const id of [...unregisters.keys(), ...states.keys()]) unload(id);
}

export const getState = (id: string) => states.get(id);
export function onStateChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}
function notify() {
    for (const listener of listeners) listener();
}
function setState(id: string, state: BackendState) {
    states.set(id, state);
    notify();
}

const registeredNames = () => new Set([...states.values()].flatMap(state => state.status === "ready" ? state.commands.map(command => command.name) : []));

function contextOf(ctx: any, reply?: any): CallContext {
    return {
        channelId: ctx?.channel?.id ?? null,
        guildId: ctx?.guild?.id ?? ctx?.channel?.guild_id ?? null,
        userId: UserStore.getCurrentUser?.()?.id ?? null,
        reply: reply ? replyContextOf(reply) : null,
    };
}

const optionsOf = (args: any[]): Record<string, unknown> =>
    Object.fromEntries((args ?? []).filter(arg => arg?.name).map(arg => [arg.name, arg.value]));

/** Built-in commands can't nest, so "share" with subcommand "send" becomes the command "share send". */
function flatten(remote: RemoteCommand): Array<{ name: string; description: string; options: RemoteOption[]; target: Target }> {
    const subs = (remote.options ?? []).filter(option => option.type === SUB_COMMAND || option.type === SUB_COMMAND_GROUP);
    if (!subs.length) return [{ name: remote.name, description: remote.description, options: remote.options ?? [], target: { command: remote.name } }];
    return subs.flatMap(sub => {
        if (sub.type === SUB_COMMAND_GROUP) {
            logger.warn(`/${remote.name} ${sub.name}: subcommand groups aren't supported; skipped`);
            return [];
        }
        return [{
            name: `${remote.name} ${sub.name}`,
            description: sub.description,
            options: (sub.options as RemoteOption[] | undefined) ?? [],
            target: { command: remote.name, subcommand: sub.name },
        }];
    });
}

/** Header for a command's section: "<backend> · <section>", or the backend's name alone. */
function sectionOf(manifest: Manifest, remote: RemoteCommand) {
    const sections = manifest.sections ?? [];
    const index = sections.findIndex(section => section.id === remote.section);
    return index === -1
        ? { name: manifest.name, index: sections.length }
        : { name: `${manifest.name} · ${sections[index].title}`, index };
}

async function run(backend: Backend, manifest: Manifest, result: Result | undefined, channelId: string, reply: any) {
    const actions: Action[] =
        result?.type === "actions" ? result.actions ?? []
            : result?.type === "message" ? [{ type: "send", content: result.content ?? "" }]
                : result?.type === "local" ? [result]
                    : result?.type === "none" ? []
                        : (() => { throw new BackendError(`Unknown reply type ${JSON.stringify((result as any)?.type)}`); })();

    for (const action of actions) {
        switch (action.type) {
            case "send":
                if (action.content) await sendText(channelId, action.content, action.reply ? reply : undefined);
                break;
            case "local":
                sendLocalMessage(channelId, { content: action.content, embeds: action.embeds });
                break;
            case "react": {
                const messageId = action.messageId ?? reply?.message?.id;
                if (!messageId) throw new BackendError("Reply to a message to react to it");
                await react(channelId, messageId, action.emoji);
                break;
            }
            case "upload":
                await sendFile(channelId, resolveUrl(backend, action.url), action.filename, action.content ?? "", action.reply ? reply : undefined);
                break;
            case "status":
                await setStatus(action.text, action.emoji, action.clearAfterMs);
                break;
            case "clipboard":
                copyText(action.text);
                break;
            case "open":
                openUrl(resolveUrl(backend, action.url));
                break;
            default:
                throw new BackendError(`${manifest.name} asked for an action this Distra doesn't know: ${(action as any)?.type}`);
        }
    }
}

function toCommand(backend: Backend, manifest: Manifest, remote: RemoteCommand, flat: ReturnType<typeof flatten>[number], order: number): Command {
    const options = flat.options.map(option => {
        const { autocomplete, ...rest } = option;
        return { ...rest, choices: autocomplete ? [] : option.choices, remoteAutocomplete: !!autocomplete };
    });
    const section = sectionOf(manifest, remote);

    let lastRefresh = 0;
    const refreshChoices = (context: CallContext) => {
        if (Date.now() - lastRefresh < CHOICES_REFRESH_MS) return;
        lastRefresh = Date.now();
        for (const option of options.filter(option => option.remoteAutocomplete)) {
            fetchChoices(backend, flat.target, option.name, "", {}, context)
                .then(choices => {
                    // In place: Discord may hold on to the option object it was given.
                    option.choices!.splice(0, option.choices!.length, ...choices.map(choice => ({ ...choice, displayName: choice.name })));
                })
                .catch(e => logger.warn(`Choices for /${flat.name} ${option.name} failed: ${e?.message ?? e}`));
        }
    };

    const command: Command = {
        name: flat.name,
        description: flat.description,
        options: options as Command["options"],
        sectionName: section.name,
        sectionOrder: order + section.index,
        remoteBackend: backend.id,
        onListed: () => refreshChoices(contextOf(undefined)),
        async execute(args, ctx) {
            const channelId = ctx.channel.id;
            const reply = pendingReply(channelId);
            try {
                const result = await execute(backend, flat.target, optionsOf(args), contextOf(ctx, reply));
                await run(backend, manifest, result, channelId, reply);
            } catch (e: any) {
                sendLocalMessage(channelId, `**${manifest.name}:** ${e instanceof BackendError ? e.message : String(e?.message ?? e)}`);
            } finally {
                if (reply) clearPendingReply(channelId);
                lastRefresh = 0;
            }
        },
    };
    refreshChoices(contextOf(undefined));
    return command;
}

function unload(id: string) {
    for (const unregister of unregisters.get(id) ?? []) unregister();
    unregisters.delete(id);
    states.delete(id);
}

export async function loadBackend(backend: Backend) {
    unload(backend.id);
    if (!running || !backend.enabled) return notify();
    setState(backend.id, { status: "loading", commands: [], skipped: [] });
    try {
        const manifest = await fetchManifest(backend);
        if (!running || !settings.backends.some(b => b.id === backend.id && b.enabled)) return;
        // Each backend gets a block of section slots, in the order backends were added.
        const order = Math.max(0, settings.backends.findIndex(b => b.id === backend.id)) * 100;
        const taken = registeredNames();
        const listed: ListedCommand[] = [];
        const skipped: string[] = [];
        const unregister: Array<() => void> = [];
        for (const remote of manifest.commands) {
            for (const flat of flatten(remote)) {
                if (taken.has(flat.name)) {
                    skipped.push(flat.name);
                    continue;
                }
                const command = toCommand(backend, manifest, remote, flat, order);
                unregister.push(registerCommand(command));
                listed.push({ name: flat.name, description: flat.description, section: command.sectionName! });
            }
        }
        unregisters.set(backend.id, unregister);
        setState(backend.id, { status: "ready", manifest, commands: listed, skipped });
        logger.info(`${manifest.name}: ${listed.length} commands from ${backend.url}${skipped.length ? `, skipped ${skipped.join(", ")}` : ""}`);
    } catch (e: any) {
        setState(backend.id, { status: "error", error: e?.message ?? String(e), commands: [], skipped: [] });
        logger.warn(`${backend.url}: ${e?.message ?? e}`);
    }
}

export function removeBackend(id: string) {
    unload(id);
    settings.backends = settings.backends.filter(backend => backend.id !== id);
    notify();
}
