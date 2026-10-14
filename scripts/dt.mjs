// Talks to a running `pnpm devtools` server.
//
//   node scripts/dt.mjs '<code>'             run code on the device (expression or statements with return)
//   node scripts/dt.mjs -f file.js           run a file
//   node scripts/dt.mjs logs [-f] [--since N] [--grep text]
//   node scripts/dt.mjs status
//   node scripts/dt.mjs reload [--build] [--plugins]
//                                            rebuild dist/distra.js (--build) and the built-in plugins (--plugins),
//                                            reload the app, wait for it
//
// Inside the code, `dt` has inspection helpers (dt.tree({ match }), dt.byName, dt.fibers, ...),
// and `distra`, `vendetta`, `bunny`, `enmity` are the usual globals.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const port = Number(process.env.DEVTOOLS_PORT ?? 4041);
const base = `http://127.0.0.1:${port}`;
const args = process.argv.slice(2);

const option = (name, fallback) => {
    const index = args.indexOf(name);
    if (index === -1) return fallback;
    const value = args[index + 1];
    args.splice(index, 2);
    return value;
};
const flag = name => {
    const index = args.indexOf(name);
    if (index === -1) return false;
    args.splice(index, 1);
    return true;
};

async function request(path, body) {
    const response = await fetch(`${base}${path}`, body === undefined ? undefined : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return response.json();
}

const print = value => console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));

try {
    if (args[0] === "status") {
        print(await request("/status"));
    } else if (args[0] === "reload") {
        const cwd = new URL("..", import.meta.url);
        if (flag("--plugins")) execFileSync(process.execPath, ["scripts/build-plugins.mjs"], { stdio: "inherit", cwd });
        if (flag("--build")) execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit", cwd });
        const before = (await request("/status")).device?.session;
        const { ok, result } = await request("/eval", { code: "const updater = globalThis.__turboModuleProxy?.('BundleUpdaterManager') ?? nativeModuleProxy.BundleUpdaterManager; setTimeout(() => updater.reload(), 300); return globalThis.distra?.builtAt ?? 'unstamped'", timeout: 5000 });
        if (!ok) throw new Error(`reload failed: ${result}`);
        const deadline = Date.now() + 60_000;
        let session;
        while ((session = (await request("/status")).device?.session) === before) {
            if (Date.now() > deadline) throw new Error("device did not reconnect within 60s");
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        // The debugger connects early in startup; the global appears once initialization finishes.
        let built;
        for (let i = 0; i < 40; i++) {
            built = await request("/eval", { code: "return globalThis.distra?.builtAt ?? 'unstamped'", timeout: 10_000 });
            if (built.result !== "unstamped") break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        console.log(`reloaded (was ${result}, now ${built.result}, session ${session})`);
    } else if (args[0] === "logs") {
        args.shift();
        const follow = flag("-f");
        const grep = option("--grep");
        let since = Number(option("--since", 0));
        const tail = Number(option("--tail", follow ? 50 : 200));
        let first = true;
        do {
            const { logs, last } = await request(`/logs?since=${since}`);
            const shown = logs.filter(line => !grep || `${line.tag} ${line.message}`.includes(grep));
            for (const line of first ? shown.slice(-tail) : shown) {
                console.log(`${line.seq} ${new Date(line.time).toLocaleTimeString()} ${line.level.toUpperCase().padEnd(5)} [${line.tag}] ${line.message}`);
            }
            since = last;
            first = false;
            if (follow) await new Promise(resolve => setTimeout(resolve, 1000));
        } while (follow);
    } else {
        const file = option("-f");
        const timeout = Number(option("--timeout", 30_000));
        const code = file ? readFileSync(file, "utf8") : args.join(" ");
        if (!code.trim()) throw new Error("no code given");
        const { ok, result, ms } = await request("/eval", { code, timeout });
        print(result);
        if (ms !== undefined) console.error(`(${ok ? "ok" : "error"}, ${ms}ms)`);
        process.exitCode = ok ? 0 : 1;
    }
} catch (e) {
    console.error(`devtools server not reachable on ${base}: ${e.message}`);
    process.exitCode = 2;
}
