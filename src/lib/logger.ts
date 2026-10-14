// Prefixed logging, plus an in-memory ring buffer shown in the Developer page.
// Entries are also forwarded to the tweak's on-device log (three-finger long
// press, or Documents/Distra/logs/latest.log).

import { callNative, isBridgeAvailable } from "@/core/bridge";

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface LogEntry {
    time: number;
    level: LogLevel;
    tag: string;
    message: string;
}

const MAX_ENTRIES = 300;
const entries: LogEntry[] = [];
const listeners = new Set<() => void>();
const entryListeners = new Set<(entry: LogEntry) => void>();
/** True while a Logger is echoing to `console`, so console captures can skip duplicates. */
export let writingToConsole = false;

let pending: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function forwardToNative(entry: LogEntry) {
    pending.push(entry);
    // Before Discord's bundle runs (entry.ts) timers may not exist yet; flush with the next entry.
    if (typeof setTimeout !== "function") return;
    flushTimer ??= setTimeout(() => {
        flushTimer = undefined;
        const batch = pending;
        pending = [];
        if (isBridgeAvailable()) callNative("log.write", batch).catch(() => { });
    }, 100);
}

function stringify(value: unknown) {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack ?? value.message;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export class Logger {
    constructor(readonly tag: string) { }

    private write(level: LogLevel, args: unknown[]) {
        const message = args.map(stringify).join(" ");
        const entry = { time: Date.now(), level, tag: this.tag, message };
        entries.push(entry);
        forwardToNative(entry);
        if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
        listeners.forEach(listener => listener());
        entryListeners.forEach(listener => listener(entry));
        // `console` is installed by Discord's bundle, so it may not exist yet.
        const console = (globalThis as any).console;
        writingToConsole = true;
        try {
            (console?.[level] ?? console?.log)?.(`[${this.tag}]`, ...args);
        } finally {
            writingToConsole = false;
        }
    }

    log = (...args: unknown[]) => this.write("log", args);
    info = (...args: unknown[]) => this.write("info", args);
    warn = (...args: unknown[]) => this.write("warn", args);
    error = (...args: unknown[]) => this.write("error", args);
    debug = (...args: unknown[]) => this.write("debug", args);
}

export const logger = new Logger("Distra");

export const getLogEntries = () => entries;

export function subscribeLogs(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

/** Calls `listener` with every new entry. */
export function onLogEntry(listener: (entry: LogEntry) => void) {
    entryListeners.add(listener);
    return () => void entryListeners.delete(listener);
}
