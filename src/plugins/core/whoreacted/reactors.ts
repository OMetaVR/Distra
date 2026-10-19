// Who reacted, from Discord's own MessageReactionsStore (filled by the reactions sheet and by
// ReactionActionCreators.getReactors, the REST call the sheet makes). Missing reactors are
// fetched through a queue: one request at a time with a gap between them, once per reaction per
// session, newest rows first, so scrolling a busy channel doesn't flood Discord with requests.

import { Logger } from "@/lib/logger";
import { findByProps, findByStoreName } from "@/metro";

const logger = new Logger("WhoReacted");

const MessageReactionsStore = findByStoreName("MessageReactionsStore");
const ReactionActions = () => findByProps("getReactors", "addReaction");

/** Reactors asked for per reaction (Discord's sheet asks for 100). */
export const FETCH_LIMIT = 25;
const GAP_MS = 400;
const MAX_GAP_MS = 4000;
const TIMEOUT_MS = 8000;
const MAX_QUEUED = 20;

export const emojiKey = (emoji: any) => (emoji?.id ? `${emoji.name ?? ""}:${emoji.id}` : emoji?.name ?? "");

/** Users Discord has loaded for a reaction (type 0 normal, 1 burst). */
export function reactorsOf(channelId: string, messageId: string, emoji: any, type: number): any[] {
    let users: any;
    try {
        users = MessageReactionsStore?.getReactions?.(channelId, messageId, emoji, FETCH_LIMIT, type);
    } catch {
        return [];
    }
    if (!users) return [];
    if (users instanceof Map) return [...users.values()].filter(Boolean);
    if (Array.isArray(users)) return users.filter(Boolean);
    return Object.values(users).filter(Boolean);
}

const requested = new Set<string>();
const queue: Array<{ key: string; run: () => Promise<unknown>; retried?: boolean }> = [];
let draining = false;
/** Gap between requests; grows after a 429 and shrinks back while requests succeed. */
let gap = GAP_MS;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const withTimeout = (promise: Promise<unknown>) => Promise.race([promise, sleep(TIMEOUT_MS)]);

async function drain() {
    if (draining) return;
    draining = true;
    try {
        while (queue.length) {
            const job = queue.shift()!;
            let wait = gap;
            try {
                await withTimeout(job.run());
                gap = Math.max(GAP_MS, Math.round(gap * 0.8));
            } catch (e: any) {
                if ((e?.status ?? e?.statusCode) === 429) {
                    // Rate limited: wait as long as Discord asks, slow down, and retry this one once.
                    const retryAfter = Number(e?.body?.retry_after);
                    wait = Math.max(2000, retryAfter > 0 ? retryAfter * 1000 : 5000);
                    gap = Math.min(MAX_GAP_MS, gap * 2);
                    if (!job.retried) queue.unshift({ ...job, retried: true });
                } else {
                    logger.warn("Fetching reactors failed", e);
                }
            }
            await sleep(wait);
        }
    } finally {
        draining = false;
    }
}

/** Fetches a reaction's reactors once; `done` runs when they have arrived. */
export function requestReactors(channelId: string, messageId: string, emoji: any, type: number, done: () => void) {
    const key = `${messageId}:${emojiKey(emoji)}:${type}`;
    if (requested.has(key)) return;
    const actions = ReactionActions();
    if (typeof actions?.getReactors !== "function") return;
    requested.add(key);
    queue.unshift({
        key,
        run: async () => {
            await actions.getReactors({ channelId, messageId, emoji, limit: FETCH_LIMIT, type });
            done();
        },
    });
    // Rows scrolled past long ago lose their place; they can ask again when drawn again.
    for (const dropped of queue.splice(MAX_QUEUED)) requested.delete(dropped.key);
    void drain();
}

export function resetReactors() {
    queue.splice(0);
    requested.clear();
    gap = GAP_MS;
}
