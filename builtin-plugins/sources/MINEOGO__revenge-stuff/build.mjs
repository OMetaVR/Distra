import { transform, initSync } from "@swc/wasm-web/wasm.js";
import { readFileSync } from "fs";
import { copyFile, mkdir } from "fs/promises";

try {
    const wasmPath = new URL("./node_modules/@swc/wasm-web/wasm_bg.wasm", import.meta.url);
    const buffer = readFileSync(wasmPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    initSync(arrayBuffer);
} catch (e) {
    console.error("Wasm initialization failed", e);
}

const swc = { transform };
import { readFile, writeFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { extname } from "path";
import { createHash } from "crypto";

import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];

const plugins = [
    nodeResolve(),
    commonjs(),
    {
        name: "swc",
        async transform(code, id) {
            const ext = extname(id);
            if (!extensions.includes(ext)) return null;

            const ts = ext.includes("ts");
            const tsx = ts ? ext.endsWith("x") : undefined;
            const jsx = !ts ? ext.endsWith("x") : undefined;

            const result = await swc.transform(code, {
                filename: id,
                jsc: {
                    externalHelpers: true,
                    parser: {
                        syntax: ts ? "typescript" : "ecmascript",
                        tsx,
                        jsx,
                    },
                },
                env: {
                    targets: "defaults",
                    include: [
                        "transform-classes",
                        "transform-arrow-functions",
                    ],
                },
            });
            return result.code;
        },
    },
    esbuild({ minify: true }),
];

for (let plug of await readdir("./plugins")) {
    const manifest = JSON.parse(await readFile(`./plugins/${plug}/manifest.json`));
    const outPath = `./dist/${plug}/index.js`;

    try {
        const bundle = await rollup({
            input: `./plugins/${plug}/${manifest.main}`,
            onwarn: () => {},
            plugins,
        });
    
        await bundle.write({
            file: outPath,
            globals(id) {
                if (id.startsWith("@vendetta")) return id.substring(1).replace(/\//g, ".");
                const map = {
                    react: "window.React",
                };

                return map[id] || null;
            },
            format: "iife",
            compact: true,
            exports: "named",
        });
        await bundle.close();
    
        const toHash = await readFile(outPath);
        manifest.hash = createHash("sha256").update(toHash).digest("hex");
        manifest.main = "index.js";
        await writeFile(`./dist/${plug}/manifest.json`, JSON.stringify(manifest));
    
        console.log(`Successfully built ${manifest.name}!`);
    } catch (e) {
        console.error("Failed to build plugin...", e);
        process.exit(1);
    }
}

const devPath = 'dev';
if (existsSync(`./${devPath}`)) {
    console.log('DEVELOPMENT')
    for (let plug of await readdir(`./${devPath}`)) {
        const manifest = JSON.parse(await readFile(`./${devPath}/${plug}/manifest.json`));
        const outPath = `./dist/dev/${plug}/index.js`;
    
        try {
            const bundle = await rollup({
                input: `./${devPath}/${plug}/${manifest.main}`,
                onwarn: () => {},
                plugins,
            });
        
            await bundle.write({
                file: outPath,
                globals(id) {
                    if (id.startsWith("@vendetta")) return id.substring(1).replace(/\//g, ".");
                    const map = {
                        react: "window.React",
                    };
    
                    return map[id] || null;
                },
                format: "iife",
                compact: true,
                exports: "named",
            });
            await bundle.close();
        
            const toHash = await readFile(outPath);
            manifest.hash = createHash("sha256").update(toHash).digest("hex");
            manifest.main = "index.js";
            await writeFile(`./dist/dev/${plug}/manifest.json`, JSON.stringify(manifest));
        
            console.log(`Successfully built ${manifest.name}!`);
        } catch (e) {
            console.error("Failed to build plugin...", e);
            process.exit(1);
        }
    }
}

if (existsSync("./_redirects")) {
    await copyFile("./_redirects", "./dist/_redirects");
}
if (existsSync("./_headers")) {
    await copyFile("./_headers", "./dist/_headers");
}

const landingHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plugin Installer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            background-color: #1e293b;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 24px;
            color: #38bdf8;
        }
        .plugin-list {
            text-align: left;
            margin-top: 10px;
        }
        .plugin-item {
            background-color: #0f172a;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid #334155;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .plugin-name {
            font-weight: 600;
            color: #f8fafc;
        }
        .copy-btn {
            background-color: #38bdf8;
            color: #0f172a;
            border: none;
            border-radius: 6px;
            padding: 8px 12px;
            font-weight: 600;
            cursor: pointer;
            font-size: 0.85rem;
            transition: background-color 0.2s;
        }
        .copy-btn:hover {
            background-color: #7dd3fc;
        }
        .toast {
            visibility: hidden;
            min-width: 200px;
            background-color: #10b981;
            color: white;
            text-align: center;
            border-radius: 8px;
            padding: 12px;
            position: fixed;
            z-index: 1;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            font-weight: 500;
        }
        .toast.show {
            visibility: visible;
            animation: fadein 0.5s, fadeout 0.5s 2.5s;
        }
        @keyframes fadein {
            from { bottom: 0; opacity: 0; }
            to { bottom: 30px; opacity: 1; }
        }
        @keyframes fadeout {
            from { bottom: 30px; opacity: 1; }
            to { bottom: 0; opacity: 0; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Available Plugins</h1>
        <div class="plugin-list">
            <div class="plugin-item">
                <span class="plugin-name">Piratifier</span>
                <button class="copy-btn" onclick="copyLink('https://tuffestplugins.pages.dev/piratifier')">Copy Link</button>
            </div>
        </div>
    </div>
    <div id="toast" class="toast">Link copied!</div>
    <script>
        function copyLink(text) {
            navigator.clipboard.writeText(text);
            var toast = document.getElementById("toast");
            toast.className = "toast show";
            setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
        }
    </script>
</body>
</html>`;

const infoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Piratifier Plugin Info</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            background-color: #1e293b;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 8px;
            color: #38bdf8;
        }
        p {
            color: #94a3b8;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        .input-group {
            display: flex;
            background-color: #0f172a;
            border: 1px solid #334155;
            border-radius: 8px;
            padding: 4px;
            margin-bottom: 16px;
        }
        input {
            flex: 1;
            background: transparent;
            border: none;
            color: #f8fafc;
            padding: 12px;
            font-size: 0.95rem;
            outline: none;
        }
        button {
            background-color: #38bdf8;
            color: #0f172a;
            border: none;
            border-radius: 6px;
            padding: 0 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        button:hover {
            background-color: #7dd3fc;
        }
        .toast {
            visibility: hidden;
            min-width: 200px;
            background-color: #10b981;
            color: white;
            text-align: center;
            border-radius: 8px;
            padding: 12px;
            position: fixed;
            z-index: 1;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            font-weight: 500;
        }
        .toast.show {
            visibility: visible;
            animation: fadein 0.5s, fadeout 0.5s 2.5s;
        }
        @keyframes fadein {
            from { bottom: 0; opacity: 0; }
            to { bottom: 30px; opacity: 1; }
        }
        @keyframes fadeout {
            from { bottom: 30px; opacity: 1; }
            to { bottom: 0; opacity: 0; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Piratifier</h1>
        <p>To install this plugin, use the link below in your revenge client:</p>
        <div class="input-group">
            <input type="text" id="pluginLink" value="https://tuffestplugins.pages.dev/piratifier" readonly>
            <button onclick="copyLink()">Copy</button>
        </div>
    </div>
    <div id="toast" class="toast">Link copied!</div>
    <script>
        function copyLink() {
            var copyText = document.getElementById("pluginLink");
            copyText.select();
            copyText.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(copyText.value);
            var toast = document.getElementById("toast");
            toast.className = "toast show";
            setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
        }
    </script>
</body>
</html>`;

await writeFile("./dist/index.html", landingHtml);
if (!existsSync("./dist/piratifier")) {
    await mkdir("./dist/piratifier");
}
await writeFile("./dist/piratifier/index.html", infoHtml);
