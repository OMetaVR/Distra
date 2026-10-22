// Renders the promo mockup (ad.html) to docs/media/distra-ad.mp4 (1080p) and docs/media/distra-ad.gif (960px).
//
// The page is a timeline of paused Web Animations; each frame seeks every animation to an exact time and
// takes a screenshot, so the result doesn't depend on how fast the machine renders. Needs ffmpeg,
// playwright-core and a Chromium (CHROME_PATH, or the newest one Playwright has downloaded).
//
//   tools/promo/setup-assets.sh <Discord.app>    once, see README.md
//   node tools/promo/render.mjs                  both files
//   node tools/promo/render.mjs --frame 9.6      one still to tools/promo/frame.png, for checking a moment

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const media = path.join(repo, "docs/media");
const FPS = 25;
const BG = "0x0a0a10";

if (!existsSync(path.join(here, "assets/fonts"))) {
    console.error("Missing tools/promo/assets: run tools/promo/setup-assets.sh <Discord.app> first.");
    process.exit(1);
}

/** The plugin library's rows: every built-in plugin's name, description and authors, alphabetical like the app. */
function writePluginList() {
    const plugins = [];
    const catalog = JSON.parse(readFileSync(path.join(repo, "builtin-plugins/catalog.json"), "utf8"));
    for (const entry of catalog.plugins) {
        const file = path.join(repo, "builtin-plugins/sources", entry.repo.replace("/", "__"), entry.path, "manifest.json");
        if (!existsSync(file)) continue;
        const manifest = JSON.parse(readFileSync(file, "utf8"));
        const authors = (manifest.authors ?? (manifest.author ? [manifest.author] : [])).map(a => a?.name ?? String(a)).join(", ");
        plugins.push({ n: manifest.name, d: manifest.description ?? "", f: entry.flavor === "enmity" ? "Enmity" : "Vendetta", a: authors });
    }
    const core = path.join(repo, "src/plugins/core");
    for (const dir of readdirSync(core)) {
        const file = ["index.tsx", "index.ts"].map(name => path.join(core, dir, name)).find(existsSync);
        if (!file) continue;
        const source = readFileSync(file, "utf8");
        const name = source.match(/manifest:\s*{\s*name:\s*"([^"]+)"/)?.[1];
        if (!name) continue;
        const description = source.match(/description:\s*"([^"]+)"/)?.[1] ?? "";
        const authorsBlock = source.slice(source.indexOf("authors"), source.indexOf("authors") + 300);
        const authors = [...authorsBlock.matchAll(/\{ name: "([^"]+)" \}/g)].map(m => m[1]).join(", ");
        plugins.push({ n: name, d: description, f: "Distra", a: authors });
    }
    plugins.sort((a, b) => a.n.toLowerCase().localeCompare(b.n.toLowerCase()));
    writeFileSync(path.join(here, "plugins.json"), JSON.stringify(plugins));
    return plugins.length;
}

const TYPES = { ".html": "text/html", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".ttf": "font/ttf" };
function serve() {
    const server = createServer((request, response) => {
        const file = path.join(here, decodeURIComponent(new URL(request.url, "http://x").pathname));
        if (!file.startsWith(here) || !existsSync(file)) return response.writeHead(404).end();
        response.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
    });
    return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function chromePath() {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
    const cache = path.join(homedir(), ".cache/ms-playwright");
    const builds = existsSync(cache) ? readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])) : [];
    for (const build of builds) {
        const executable = path.join(cache, build, "chrome-linux64/chrome");
        if (existsSync(executable)) return executable;
    }
    return undefined; // Playwright's own default
}

/** Renders frames at `scale` into `dir` (or the given times). `still` keeps the background glows still (GIF-friendly). */
async function render(browser, port, { dir, scale, still = false, times }) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
    page.on("pageerror", error => console.error("page error:", error.message));
    await page.goto(`http://127.0.0.1:${port}/ad.html${still ? "?static" : ""}`);
    const duration = await page.evaluate(() => window.ready);
    times ??= Array.from({ length: Math.round(duration * FPS) }, (_, i) => i / FPS);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [i, t] of times.entries()) {
        await page.evaluate(time => window.seek(time), t);
        await page.screenshot({ path: path.join(dir, `${String(i).padStart(4, "0")}.png`) });
        if (i % 100 === 0) process.stdout.write(`\r${path.basename(dir)}: ${i}/${times.length}`);
    }
    process.stdout.write(`\r${path.basename(dir)}: ${times.length}/${times.length}\n`);
    await page.close();
}

const ffmpeg = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

console.log(`${writePluginList()} plugins in the library`);
const server = await serve();
const { port } = server.address();
const browser = await chromium.launch({ executablePath: chromePath(), args: ["--font-render-hinting=none"] });
try {
    const frameAt = process.argv.indexOf("--frame");
    if (frameAt !== -1) {
        const dir = path.join(here, "frames-check");
        await render(browser, port, { dir, scale: 1.5, times: [Number(process.argv[frameAt + 1])] });
        execFileSync("cp", [path.join(dir, "0000.png"), path.join(here, "frame.png")]);
        rmSync(dir, { recursive: true, force: true });
        console.log("Wrote tools/promo/frame.png");
    } else {
        const frames = path.join(here, "frames");
        const still = path.join(here, "frames-still");
        await render(browser, port, { dir: frames, scale: 1.5 });
        await render(browser, port, { dir: still, scale: 1, still: true });
        mkdirSync(media, { recursive: true });
        // The ad ends on a fade to the background colour; fading in from it makes the loop seamless.
        const fadeIn = `fade=t=in:st=0:d=0.6:color=${BG}`;
        ffmpeg("-framerate", String(FPS), "-i", `${frames}/%04d.png`, "-vf", fadeIn, "-c:v", "libx264", "-preset", "slow", "-crf", "16",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(media, "distra-ad.mp4"));
        const palette = path.join(here, "palette.png");
        const scale = `${fadeIn},scale=960:-1:flags=lanczos`;
        ffmpeg("-framerate", String(FPS), "-i", `${still}/%04d.png`, "-vf", `${scale},palettegen=max_colors=256:stats_mode=diff`, palette);
        // Ordered dithering stays the same from frame to frame, which keeps the GIF small.
        ffmpeg("-framerate", String(FPS), "-i", `${still}/%04d.png`, "-i", palette, "-lavfi",
            `${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, "-loop", "0", path.join(media, "distra-ad.gif"));
        rmSync(palette, { force: true });
        for (const dir of [frames, still]) rmSync(dir, { recursive: true, force: true });
        console.log("Wrote docs/media/distra-ad.mp4 and docs/media/distra-ad.gif");
    }
} finally {
    await browser.close();
    server.close();
}
