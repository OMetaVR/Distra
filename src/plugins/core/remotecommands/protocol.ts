// Client side of the Remote Commands protocol (docs/REMOTE_COMMANDS.md).

import type { Backend } from "./settings";

export const PROTOCOL = 1;
const TIMEOUT_MS = 15_000;

export interface RemoteOption {
    name: string;
    description: string;
    type: number;
    required?: boolean;
    autocomplete?: boolean;
    choices?: Array<{ name: string; value: string | number }>;
    [key: string]: unknown;
}

export interface RemoteCommand {
    name: string;
    description: string;
    section?: string;
    options?: RemoteOption[];
}

export interface Manifest {
    protocol: number;
    name: string;
    revision?: string;
    sections?: Array<{ id: string; title: string }>;
    commands: RemoteCommand[];
}

export interface Choice {
    name: string;
    value: string | number;
}

export interface ReplyContext {
    messageId: string;
    channelId: string;
    content: string;
    author: { id: string; username?: string; globalName?: string | null } | null;
    attachments: Array<{ url: string; filename: string; contentType?: string; size?: number }>;
}

export interface CallContext {
    channelId: string | null;
    guildId: string | null;
    userId: string | null;
    /** The message the user is replying to, if any. */
    reply?: ReplyContext | null;
}

export type Action =
    | { type: "send"; content: string; reply?: boolean }
    | { type: "local"; content?: string; embeds?: unknown[] }
    | { type: "react"; emoji: string; messageId?: string | null }
    | { type: "upload"; url: string; filename: string; content?: string; reply?: boolean }
    | { type: "status"; text: string; emoji?: string | null; clearAfterMs?: number | null }
    | { type: "clipboard"; text: string }
    | { type: "open"; url: string };

export type Result =
    | { type: "message"; content?: string; embeds?: unknown[] }
    | { type: "local"; content?: string; embeds?: unknown[] }
    | { type: "actions"; actions: Action[] }
    | { type: "none" };

export class BackendError extends Error {}

async function call<T>(backend: Backend, endpoint: string, body?: unknown): Promise<T> {
    const url = `${backend.url.replace(/\/+$/, "")}/rc/v1/${endpoint}`;
    const request = fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${backend.token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BackendError("The backend didn't answer in time")), TIMEOUT_MS);
    });
    let response: Response;
    try {
        response = await Promise.race([request, timeout]);
    } catch (e) {
        throw e instanceof BackendError ? e : new BackendError(`Couldn't reach ${backend.url}`);
    } finally {
        clearTimeout(timer);
    }
    const data: any = await response.json().catch(() => null);
    if (!response.ok) throw new BackendError(data?.error ?? `The backend replied ${response.status}`);
    return data as T;
}

export async function fetchManifest(backend: Backend): Promise<Manifest> {
    const manifest = await call<Manifest>(backend, "manifest");
    if (!manifest || !Array.isArray(manifest.commands)) throw new BackendError("Not a Remote Commands backend");
    if (Math.floor(Number(manifest.protocol)) > PROTOCOL) {
        throw new BackendError(`Needs protocol ${manifest.protocol}; this Distra speaks ${PROTOCOL}`);
    }
    return manifest;
}

/** A command as the protocol addresses it: its name, plus the subcommand for flattened ones. */
export interface Target {
    command: string;
    subcommand?: string;
}

export async function fetchChoices(backend: Backend, target: Target, option: string, query: string, options: Record<string, unknown>, context: CallContext) {
    const data = await call<{ choices?: Choice[] }>(backend, "choices", { ...target, option, query, options, context });
    return Array.isArray(data?.choices) ? data.choices.slice(0, 25) : [];
}

export function execute(backend: Backend, target: Target, options: Record<string, unknown>, context: CallContext) {
    return call<Result>(backend, "execute", { ...target, options, context });
}

/** Resolves a URL a backend returned, which may be relative to the backend's base URL. */
export function resolveUrl(backend: Backend, url: string) {
    if (/^https?:\/\//i.test(url)) return url;
    const base = backend.url.replace(/\/+$/, "");
    if (url.startsWith("/")) return (base.match(/^https?:\/\/[^/]+/i)?.[0] ?? base) + url;
    return `${base}/${url}`;
}
