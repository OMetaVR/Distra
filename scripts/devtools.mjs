// Remote debugger server (see src/core/devtools.ts).
//
//   pnpm devtools                 # prints the URL to enter on the device
//   node scripts/dt.mjs '<code>'  # runs code on the device, prints the result
//   node scripts/dt.mjs logs -f   # device logs
//
// The device long-polls /poll for code and posts /result and /log; those endpoints need the
// token. The control endpoints (/eval, /status, /logs) only answer requests from this machine.

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.DEVTOOLS_PORT ?? 4041);
const stateDir = path.join(root, "dist");
const tokenFile = path.join(stateDir, ".devtools-token");
const logFile = path.join(stateDir, "devtools.log");
mkdirSync(stateDir, { recursive: true });

// The token is kept across restarts so the device doesn't need reconfiguring.
function loadToken() {
    if (process.env.DEVTOOLS_TOKEN) return process.env.DEVTOOLS_TOKEN;
    const saved = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "";
    if (saved) return saved;
    const created = randomBytes(6).toString("base64url").replace(/[-_]/g, "x");
    writeFileSync(tokenFile, created);
    return created;
}
const token = loadToken();

const POLL_HOLD_MS = 25_000;
const MAX_LOGS = 20_000;

/** @type {{ id: string; code: string }[]} */
const queue = [];
/** @type {Map<string, (result: unknown) => void>} */
const pending = new Map();
/** @type {Set<(commands: unknown[]) => void>} */
const pollers = new Set();
/** @type {{ seq: number; time: number; level: string; tag: string; message: string }[]} */
const logs = [];
let logSeq = 0;
let nextId = 1;
let device = null;
let lastSeen = 0;

function readBody(request, limit = 20 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        request.on("data", chunk => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error("body too large"));
                request.destroy();
            } else chunks.push(chunk);
        });
        request.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            try {
                resolve(text ? JSON.parse(text) : {});
            } catch (e) {
                reject(e);
            }
        });
        request.on("error", reject);
    });
}

const json = (response, status, body) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
};

function addLog(entry) {
    const line = { seq: ++logSeq, time: entry.time ?? Date.now(), level: entry.level ?? "log", tag: entry.tag ?? "?", message: String(entry.message ?? "") };
    logs.push(line);
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    appendFileSync(logFile, `${new Date(line.time).toISOString()} ${line.level.toUpperCase().padEnd(5)} [${line.tag}] ${line.message}\n`);
}

function flushToPollers() {
    if (!queue.length) return;
    for (const resolve of pollers) {
        pollers.delete(resolve);
        resolve(queue.splice(0));
        return;
    }
}

// Requests proxied by `tailscale serve` (or any reverse proxy) come from 127.0.0.1 too; they are remote.
const isLocal = request => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)
    && !request.headers["x-forwarded-for"] && !request.headers["tailscale-user-login"];

createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!isLocal(request) && process.env.DEVTOOLS_TRACE !== "0") console.log(`${new Date().toLocaleTimeString()} ${request.method} ${url.pathname} from ${request.headers["x-forwarded-for"] ?? request.socket.remoteAddress}`);
    const route = `${request.method} ${url.pathname}`;
    try {
        // The development bundle, for Developer > Load from custom URL (rebuild with `node scripts/build.mjs`),
        // and the built-in plugins it loads from next to itself (`node scripts/build-plugins.mjs`).
        const served = { "GET /distra.js": "application/javascript", "GET /builtins.json": "application/json" }[route];
        if (served) {
            const file = path.join(stateDir, url.pathname.slice(1));
            if (!existsSync(file)) return json(response, 404, { error: `no ${url.pathname.slice(1)}; run pnpm build` });
            response.writeHead(200, { "Content-Type": served, "Cache-Control": "no-store" });
            return response.end(readFileSync(file));
        }

        // Files built-in plugins load from the repository (builtin-plugins/assets), for testing before they're pushed.
        if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
            const name = path.basename(url.pathname);
            const file = path.join(root, "builtin-plugins", "assets", name);
            if (!existsSync(file)) return json(response, 404, { error: "not found" });
            response.writeHead(200, { "Content-Type": { ".mp3": "audio/mpeg", ".png": "image/png" }[path.extname(name)] ?? "application/octet-stream" });
            return response.end(readFileSync(file));
        }

        // Device endpoints
        if (["POST /hello", "GET /poll", "POST /result", "POST /log"].includes(route)) {
            if (url.searchParams.get("token") !== token) {
                console.log(`rejected ${route} from ${request.socket.remoteAddress}: bad token "${url.searchParams.get("token") ?? ""}"`);
                return json(response, 401, { error: "bad token" });
            }
            lastSeen = Date.now();
            if (route === "POST /hello") {
                const body = await readBody(request);
                device = { ...body, session: url.searchParams.get("session"), address: request.socket.remoteAddress, connectedAt: Date.now() };
                addLog({ level: "info", tag: "devtools", message: `device connected from ${device.address} (Discord ${body.loader?.discord?.version ?? "?"}, session ${device.session})` });
                console.log(`device connected from ${device.address}`);
                return json(response, 200, { ok: true });
            }
            if (route === "GET /poll") {
                if (queue.length) return json(response, 200, { commands: queue.splice(0) });
                const commands = await new Promise(resolve => {
                    const deliver = commands => {
                        clearTimeout(timer);
                        pollers.delete(deliver);
                        resolve(commands);
                    };
                    const timer = setTimeout(() => deliver([]), POLL_HOLD_MS);
                    pollers.add(deliver);
                    response.on("close", () => {
                        if (pollers.has(deliver)) deliver([]);
                    });
                });
                if (response.destroyed) {
                    queue.unshift(...commands);
                    return;
                }
                return json(response, 200, { commands });
            }
            const body = await readBody(request);
            if (route === "POST /result") {
                pending.get(String(body.id))?.(body);
                pending.delete(String(body.id));
                return json(response, 200, { ok: true });
            }
            for (const entry of Array.isArray(body) ? body : [body]) addLog(entry);
            return json(response, 200, { ok: true });
        }

        // Control endpoints (this machine only)
        if (!isLocal(request)) return json(response, 403, { error: "local only" });
        if (route === "GET /status") {
            return json(response, 200, { device, lastSeenMsAgo: lastSeen ? Date.now() - lastSeen : null, polling: pollers.size > 0, queued: queue.length });
        }
        if (route === "GET /logs") {
            const since = Number(url.searchParams.get("since") ?? 0);
            return json(response, 200, { logs: logs.filter(line => line.seq > since), last: logSeq });
        }
        if (route === "POST /eval") {
            const { code, timeout = 30_000 } = await readBody(request);
            const id = String(nextId++);
            const result = await new Promise(resolve => {
                const timer = setTimeout(() => {
                    pending.delete(id);
                    const index = queue.findIndex(command => command.id === id);
                    if (index !== -1) queue.splice(index, 1);
                    resolve({ ok: false, result: `timed out after ${timeout}ms (device ${pollers.size ? "polling" : "not connected"})` });
                }, timeout);
                pending.set(id, value => {
                    clearTimeout(timer);
                    resolve(value);
                });
                queue.push({ id, code });
                flushToPollers();
            });
            return json(response, 200, result);
        }
        json(response, 404, { error: "not found" });
    } catch (e) {
        json(response, 500, { error: String(e) });
    }
}).listen(port, "0.0.0.0", () => {
    const addresses = Object.values(networkInterfaces()).flat()
        .filter(info => info?.family === "IPv4" && !info.internal)
        .map(info => `http://${info.address}:${port}/?token=${token}`);
    console.log(`Remote debugger listening. Enter one of these in Distra > Developer > Remote debugger:\n  ${addresses.join("\n  ")}`);
    console.log(`Logs: ${path.relative(root, logFile)}`);
});
