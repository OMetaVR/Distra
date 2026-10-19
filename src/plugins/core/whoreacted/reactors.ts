// Who reacted, from Discord's own MessageReactionsStore (filled by the reactions sheet and by
// ReactionActionCreators.getReactors, the REST call the sheet makes). Missing reactors are
// fetched through a queue: a few requests at a time with a gap between them, once per reaction per
// session, newest message first, so scrolling a busy channel doesn't flood Discord with requests.

import { Logger } from "@/lib/logger";
import { findByProps, findByStoreName } from "@/metro";

const logger = new Logger("WhoReacted");

const MessageReactionsStore = findByStoreName("MessageReactionsStore");
const ReactionActions = () => findByProps("getReactors", "addReaction");

/** Most reactors read from the store per reaction (Discord's sheet loads up to 100). */
const STORE_LIMIT = 100;
const GAP_MS = 150;
const MAX_GAP_MS = 4000;
const TIMEOUT_MS = 8000;
/** Chat rows are built once (scrolling doesn't rebuild them), so dropped requests wouldn't come back: keep plenty. */
const MAX_QUEUED = 500;

export const emojiKey = (emoji: any) => (emoji?.id ? `${emoji.name ?? ""}:${emoji.id}` : emoji?.name ?? "");

/** Users Discord has loaded for a reaction (type 0 normal, 1 burst). */
export function reactorsOf(channelId: string, messageId: string, emoji: any, type: number): any[] {
    let users: any;
    try {
        users = MessageReactionsStore?.getReactions?.(channelId, messageId, emoji, STORE_LIMIT, type);
    } catch {
        return [];
    }
    if (!users) return [];
    if (users instanceof Map) return [...users.values()].filter(Boolean);
    if (Array.isArray(users)) return users.filter(Boolean);
    return Object.values(users).filter(Boolean);
}

interface Job {
    key: string;
    /** Message id (newest first) and the reaction's place in it, for ordering. */
    messageId: bigint;
    order: number;
    run: () => Promise<unknown>;
    retried?: boolean;
}

const requested = new Set<string>();
/** Waiting requests, newest message first, so the messages on screen fill in first. */
const queue: Job[] = [];
/** Requests in flight at once. */
const CONCURRENCY = 3;
let running = 0;
/** Gap between starting requests; grows after a 429 and shrinks back while requests succeed. */
let gap = GAP_MS;
let pausedUntil = 0;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const withTimeout = (promise: Promise<unknown>) => Promise.race([promise, sleep(TIMEOUT_MS)]);
const before = (a: Job, b: Job) => a.messageId !== b.messageId ? a.messageId > b.messageId : a.order < b.order;

function enqueue(job: Job) {
    let index = queue.findIndex(other => before(job, other));
    if (index === -1) index = queue.length;
    queue.splice(index, 0, job);
    for (const dropped of queue.splice(MAX_QUEUED)) requested.delete(dropped.key);
}

async function work() {
    running++;
    try {
        while (queue.length) {
            const wait = pausedUntil - Date.now();
            if (wait > 0) await sleep(wait);
            const job = queue.shift();
            if (!job) break;
            try {
                await withTimeout(job.run());
                gap = Math.max(GAP_MS, Math.round(gap * 0.8));
            } catch (e: any) {
                if ((e?.status ?? e?.statusCode) === 429) {
                    // Rate limited: everyone waits as long as Discord asks, slows down, and this one retries once.
                    const retryAfter = Number(e?.body?.retry_after);
                    pausedUntil = Date.now() + Math.max(1000, retryAfter > 0 ? retryAfter * 1000 : 5000);
                    gap = Math.min(MAX_GAP_MS, gap * 2);
                    if (!job.retried) enqueue({ ...job, retried: true });
                } else {
                    // Let the next time the row is built ask again.
                    requested.delete(job.key);
                    logger.warn("Fetching reactors failed", e);
                }
            }
            await sleep(gap);
        }
    } finally {
        running--;
    }
}

function snowflake(id: string) {
    try {
        return BigInt(id);
    } catch {
        return BigInt(0);
    }
}

/**
 * Fetches the first `limit` reactors of a reaction once (only as many as get shown, so busy
 * messages cost one small request per reaction); `done` runs when they have arrived. `order` is
 * the reaction's place in its message.
 */
export function requestReactors(channelId: string, messageId: string, emoji: any, type: number, limit: number, order: number, done: () => void) {
    const key = `${messageId}:${emojiKey(emoji)}:${type}`;
    if (requested.has(key)) return;
    const actions = ReactionActions();
    if (typeof actions?.getReactors !== "function") return;
    requested.add(key);
    enqueue({
        key,
        messageId: snowflake(messageId),
        order: order * 2 + type,
        run: async () => {
            await actions.getReactors({ channelId, messageId, emoji, limit: Math.min(100, Math.max(1, limit)), type });
            done();
        },
    });
    while (running < CONCURRENCY && running < queue.length) void work();
}

export function resetReactors() {
    queue.splice(0);
    requested.clear();
    gap = GAP_MS;
    pausedUntil = 0;
}
