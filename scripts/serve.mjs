// Development server: rebuilds on change and serves dist/discordia.js.
// On the device, enable Settings > Developer > "Load from custom URL" and point
// it at http://<this machine's LAN IP>:4040/discordia.js, then reload Discord.

import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4040);
const bundle = path.join(root, "dist", "discordia.js");

spawn(process.execPath, [path.join(root, "scripts/build.mjs"), "--watch", "--no-embed"], { stdio: "inherit" });

createServer((request, response) => {
    if (request.url?.split("?")[0] !== "/discordia.js" || !existsSync(bundle)) {
        response.writeHead(404).end();
        return;
    }
    response.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
    createReadStream(bundle).pipe(response);
}).listen(port, () => {
    const addresses = Object.values(networkInterfaces()).flat()
        .filter(info => info?.family === "IPv4" && !info.internal)
        .map(info => `http://${info.address}:${port}/discordia.js`);
    console.log(`Serving ${path.relative(root, bundle)} at:\n  ${addresses.join("\n  ") || `http://localhost:${port}/discordia.js`}`);
});
