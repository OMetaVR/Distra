import { readFile, writeFile, readdir, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { extname, join } from "path";
import { createHash } from "crypto";

import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import swc from "@swc/core";

function parseReadme(content) {
    const lines = content.split('\n');
    const front = {};
    let i = 0;
    while (i < lines.length && lines[i].startsWith('<meta ')) {
        const line = lines[i];
        const match = line.match(/property="([^"]+)" content="([^"]+)"/) || line.match(/name="([^"]+)" content="([^"]+)"/);
        if (match) {
            const key = match[1].replace(/:/g, '_').replace(/-/g, '_');
            front[key] = match[2];
        }
        i++;
    }
    const body = lines.slice(i).join('\n');
    return { front, body };
}

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];
const pluginPages = [];
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function normalizeKey(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isBlank(value) {
    return value == null || String(value).trim() === "";
}

function isExternalUrl(value) {
    return typeof value === "string" && value.includes("://");
}

async function buildImageEntries() {
    const entries = [];
    if (!existsSync("./images")) return entries;

    const dirEntries = await readdir("./images", { withFileTypes: true });
    for (const entry of dirEntries) {
        if (!entry.isFile()) continue;
        const ext = extname(entry.name).toLowerCase();
        if (!imageExtensions.has(ext)) continue;

        const base = entry.name.slice(0, -ext.length);
        const key = normalizeKey(base);
        entries.push({ key, name: entry.name });
    }

    return entries;
}

async function copyDir(src, dest) {
    if (!existsSync(src)) return;
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
            await copyFile(srcPath, destPath);
        }
    }
}

const imageEntries = await buildImageEntries();

function getLocalImagesForPlugin(slug) {
    const key = normalizeKey(slug);
    const matches = imageEntries
        .filter((entry) => entry.key.startsWith(key))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    return matches.map((name) => `images/${name}`);
}

function getLocalImageByKey(rawKey) {
    const key = normalizeKey(rawKey);
    const match = imageEntries.find((entry) => entry.key === key);
    return match ? `images/${match.name}` : null;
}

/** @type import("rollup").InputPluginOption */
const plugins = [
    nodeResolve({ extensions }),
    commonjs(),
    json(),
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
            onwarn: () => { },
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

        const readmePath = `./plugins/${plug}/README.md`;
        if (existsSync(readmePath)) {
            const content = await readFile(readmePath, 'utf8');
            const { front, body } = parseReadme(content);
            const localImages = getLocalImagesForPlugin(plug);
            const localImage = localImages[0];
            const galleryImages = localImages.slice(1);
            if (!front.page_image && localImage) {
                front.page_image = localImage;
                front.page_image_alt = manifest.name;
            }
            if (!front.page_gallery && galleryImages.length) {
                front.page_gallery = galleryImages.join("|");
                front.page_gallery_alt = manifest.name;
            }
            if (localImage) {
                if (isBlank(front.og_image) || isExternalUrl(front.og_image)) {
                    front.og_image = localImage;
                }
                if (isBlank(front.twitter_image) || isExternalUrl(front.twitter_image)) {
                    front.twitter_image = localImage;
                }
            }
            front.commit_path = `plugins/${plug}`;
            front.commit_repo = "Vaiskiainen/testplugins";

            const frontStr = Object.keys(front).length
                ? '---\nlayout: page\n' + Object.entries(front).map(([k,v]) => `${k}: "${String(v).replace(/"/g, '\\"')}"`).join('\n') + '\n---\n'
                : '---\nlayout: page\n---\n';
            await writeFile(`./dist/${plug}/index.md`, frontStr + body);
        } else {
            const localImages = getLocalImagesForPlugin(plug);
            const localImage = localImages[0];
            const galleryImages = localImages.slice(1);
            const imageFront = localImage
                ? `page_image: "${localImage}"\npage_image_alt: "${manifest.name.replace(/"/g, '\\"')}"\n${galleryImages.length ? `page_gallery: "${galleryImages.join("|")}"\npage_gallery_alt: "${manifest.name.replace(/"/g, '\\"')}"\n` : ""}`
                : "";
            const content = `---\nlayout: page\ntitle: "${manifest.name.replace(/"/g, '\\"')}"\n${imageFront}commit_path: "plugins/${plug}"\ncommit_repo: "Vaiskiainen/testplugins"\n---\n# ${manifest.name}\n\n${manifest.description}\n\n## Installation\n\nCopy the following link and paste it into the Plugins page of Vendetta:\n\nhttps://vaiskiainen.github.io/testplugins/${plug}\n\n## Authors\n\n${manifest.authors.map(a => `- **${a.name}**`).join('\n')}`;
            await writeFile(`./dist/${plug}/index.md`, content);
        }

        pluginPages.push({
            slug: plug,
            name: manifest.name,
            description: manifest.description || "",
        });

        console.log(`Successfully built ${manifest.name}!`);
    } catch (e) {
        console.error("Failed to build plugin...", e);
        process.exit(1);
    }
}

await mkdir('./dist/plugins', { recursive: true });
const pluginsList = pluginPages
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((plugin) => `- [${plugin.name}](../${plugin.slug}/)${plugin.description ? ` - ${plugin.description}` : ""}`)
    .join('\n');
const pluginsIndex = `---\nlayout: page\ntitle: "Plugins"\n---\n# Plugins\n\n${pluginsList}\n`;
await writeFile('./dist/plugins/index.md', pluginsIndex);

const promoImage = getLocalImageByKey("testplugins_promo");
const promoFront = promoImage ? `page_image: "${promoImage}"\npage_image_alt: "Testplugins promo"\n` : "";
const homeIndex = `---\nlayout: page\ntitle: "Testplugins"\n${promoFront}---\n# Testplugins\n\nPersonal plugins for Vendetta-like clients.\n\n- Browse all plugins: [plugins](./plugins/)\n- Project wiki: [wiki](https://github.com/Vaiskiainen/testplugins/wiki)\n`;
await writeFile('./dist/index.md', homeIndex);

await mkdir('./dist/_layouts', { recursive: true });
const layoutHtml = await readFile('./site/page.html', 'utf8');
await writeFile('./dist/_layouts/page.html', layoutHtml);

await copyDir("./images", "./dist/images");
