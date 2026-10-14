// Builds the built-in plugins listed in builtin-plugins/catalog.json from their
// vendored sources (builtin-plugins/sources) into one blob the tweak embeds.
//
//   node scripts/build-plugins.mjs            build everything
//   node scripts/build-plugins.mjs <id|text>  build matching plugins only (for debugging)
//
// Output: dist/builtins.json and tweak/Sources/Generated/EmbeddedBuiltins.S.
//
// Imports are mapped the same way the upstream plugin templates do it:
//   Vendetta/Bunny/Revenge: `@vendetta/x/y` -> `vendetta.x.y`, `react` -> `window.React`
//   Enmity/Aliucord:        `enmity/*` -> the enmity API package (which reads `window.enmity`)

import swc from "@swc/core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsRoot = path.join(root, "builtin-plugins");
const catalog = JSON.parse(readFileSync(path.join(pluginsRoot, "catalog.json"), "utf8"));
const enmityApi = path.join(pluginsRoot, "node_modules", "enmity", "lib");
const filter = process.argv[2]?.toLowerCase();

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];

/**
 * Per-repository build settings mirroring custom steps in an upstream build config.
 * Each returns { pragma, pragmaFrag, banner, alias, define } for a plugin.
 */
const REPO_OVERRIDES = {
    // scripts/build/modules/workers/plugins.ts: build-time constants, including each plugin's English
    // strings (lang/values/base/<plugin_name>.json). Without them the plugins throw ReferenceErrors.
    "nexpid/RevengePlugins": ({ dir }) => {
        const repoDir = dir.slice(0, dir.indexOf("/src/plugins/"));
        const langFile = path.join(repoDir, "lang/values/base", `${path.basename(dir).replaceAll("-", "_")}.json`);
        return {
            // The same file parser as upstream: image imports are `{ uri, width, height }` objects (a bare data
            // URL string is not a valid Image source, so every image in these plugins rendered blank).
            imageObjects: true,
            define: {
                IS_DEV: "false",
                PREVIEW_LANG: "false",
                DEFAULT_LANG: existsSync(langFile) ? readFileSync(langFile, "utf8") : "undefined",
                DEV_LANG: "undefined",
                PLUGINS_LIST: "[]",
            },
        };
    },
    // rollup.config.ts: JSX factory `__jsx__`, react aliased to a shim, and build metadata injected as `__lib_meta_data__`.
    "doggybootsy/enmity-plugins": ({ dir, rawManifest }) => ({
        pragma: "__jsx__",
        pragmaFrag: "__jsx__.Fragment",
        banner: "var __jsx__=Object.assign(function(){return window.enmity.modules.common.React.createElement.apply(null,arguments)},window.enmity.modules.common.React);",
        alias: { react: "./packages/fake_node_modules/react.ts" },
        define: {
            __lib_meta_data__: JSON.stringify({
                id: path.basename(dir),
                manifest: rawManifest,
                invite: "yYJA3qQE5F",
                git: { url: "https://github.com/doggybootsy/enmity-plugins", branch: "main" },
                IS_PROD: true,
            }),
        },
    }),
};

/** Width and height of a PNG/GIF/JPEG, or 0 when the format isn't recognised. */
function imageSize(buffer) {
    if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
    if (buffer.length > 10 && buffer.toString("latin1", 0, 3) === "GIF") return [buffer.readUInt16LE(6), buffer.readUInt16LE(8)];
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        for (let i = 2; i + 9 < buffer.length;) {
            if (buffer[i] !== 0xff) { i++; continue; }
            const marker = buffer[i + 1];
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buffer.readUInt16BE(i + 7), buffer.readUInt16BE(i + 5)];
            i += 2 + buffer.readUInt16BE(i + 2);
        }
    }
    return [0, 0];
}

/** Image imports as upstream's nexpid build makes them: `{ uri: dataUrl, width, height }`. */
const imageObjectPlugin = {
    name: "image-objects",
    setup(b) {
        b.onLoad({ filter: /\.(png|jpe?g|gif|webp)$/i }, ({ path: file }) => {
            const data = readFileSync(file);
            const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[path.extname(file).slice(1).toLowerCase()];
            const [width, height] = imageSize(data);
            const image = { uri: `data:${mime};base64,${data.toString("base64")}`, width, height, file: null, allowIconTheming: false };
            return { contents: `export default ${JSON.stringify(image)};`, loader: "js" };
        });
    },
};

/** swc settings from the Vendetta plugin template, so output matches upstream builds. */
const swcOptions = (file, overrides = {}) => {
    const ext = path.extname(file);
    const ts = ext.includes("ts");
    return {
        filename: file,
        jsc: {
            externalHelpers: true,
            parser: { syntax: ts ? "typescript" : "ecmascript", tsx: ts && ext.endsWith("x"), jsx: !ts && ext.endsWith("x") },
            transform: { react: { runtime: "classic", pragma: overrides.pragma, pragmaFrag: overrides.pragmaFrag } },
        },
        env: {
            targets: "fully supports es6",
            include: ["transform-block-scoping", "transform-classes", "transform-async-to-generator", "transform-async-generator-functions"],
            exclude: [
                "transform-parameters", "transform-template-literals", "transform-exponentiation-operator",
                "transform-named-capturing-groups-regex", "transform-nullish-coalescing-operator",
                "transform-object-rest-spread", "transform-optional-chaining", "transform-logical-assignment-operators",
            ],
        },
    };
};

/** Maps mod API imports onto the globals the plugin loader provides. */
function apiImportsPlugin(flavor) {
    return {
        name: "api-imports",
        setup(b) {
            const virtual = (contents) => ({ contents, loader: "js", resolveDir: root });

            // Vendetta family. `vendetta` is the parameter the loader wraps plugin code in.
            b.onResolve({ filter: /^@vendetta(\/|$)/ }, ({ path: id }) => ({ path: id, namespace: "vendetta-api" }));
            b.onLoad({ filter: /.*/, namespace: "vendetta-api" }, ({ path: id }) =>
                virtual(`module.exports = ${id.slice(1).replace(/\//g, ".")};`));

            b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "global-api" }));
            b.onResolve({ filter: /^react-native$/ }, () => ({ path: "react-native", namespace: "global-api" }));
            b.onLoad({ filter: /.*/, namespace: "global-api" }, ({ path: id }) =>
                virtual(`module.exports = ${id === "react" ? "window.React" : "window.ReactNative"};`));

            // Enmity: resolve to the API package's sources.
            if (flavor === "enmity") {
                b.onResolve({ filter: /^enmity(\/|$)/ }, ({ path: id }) => {
                    // Older plugins import `enmity/modules`, which the API package later renamed to `enmity/metro`.
                    const sub = id === "enmity" ? "index" : id.slice("enmity/".length).replace(/^modules(?=\/|$)/, "metro");
                    for (const candidate of [sub, `${sub}/index`]) {
                        for (const ext of [".ts", ".tsx"]) {
                            const file = path.join(enmityApi, candidate + ext);
                            if (existsSync(file)) return { path: file };
                        }
                    }
                    return { errors: [{ text: `Unknown enmity module ${id}` }] };
                });
            }
        },
    };
}

const swcPlugin = (overrides) => ({
    name: "swc",
    setup(b) {
        b.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async ({ path: file }) => {
            if (file.includes(`${path.sep}@swc${path.sep}helpers${path.sep}`)) return;
            // Keep TypeScript semantics for esbuild, which treats unresolved imports from TS
            // files as erased type imports (plugins re-export types across files).
            const loader = /\.[cm]?tsx?$/.test(file) ? "ts" : "js";
            try {
                return { contents: (await swc.transformFile(file, swcOptions(file, overrides))).code, loader };
            } catch (e) {
                // Some plugins put JSX in .ts files; swc picks the parser from the file name.
                if (!file.endsWith(".ts")) throw e;
                const tsxName = `${file}x`;
                return { contents: (await swc.transform(readFileSync(file, "utf8"), swcOptions(tsxName, overrides))).code, loader };
            }
        });
    },
});

function findEntry(dir, manifest) {
    const candidates = [manifest?.main, "src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js", "index.tsx", "index.ts"].filter(Boolean);
    for (const candidate of candidates) {
        const file = path.join(dir, candidate);
        if (existsSync(file) && SOURCE_EXTENSIONS.includes(path.extname(file))) return file;
    }
    return null;
}

/** Nearest tsconfig.json between the plugin folder and the repository root (for path aliases). */
function findTsconfig(dir, repoDir) {
    for (let current = dir; current.startsWith(repoDir); current = path.dirname(current)) {
        const file = path.join(current, "tsconfig.json");
        if (existsSync(file)) return file;
        if (current === repoDir) break;
    }
    return undefined;
}

/** Upstream build output committed to the repo, used when the source doesn't build. */
function findPrebuilt(dir, repoDir, manifest) {
    const names = [manifest?.name, path.basename(dir)].filter(Boolean);
    const candidates = [
        ...names.map(name => path.join(dir, "dist", `${name}.js`)),
        ...names.map(name => path.join(repoDir, "dist", `${name}.js`)),
        ...names.map(name => path.join(repoDir, "dist", `${name.toLowerCase()}.js`)),
        path.join(dir, "dist", "index.js"),
    ];
    return candidates.find(existsSync) ?? null;
}

async function bundle(entry, flavor, repoDir, dir, overrides) {
    try {
        return await bundleWith(entry, flavor, repoDir, overrides, { tsconfig: findTsconfig(dir, repoDir) });
    } catch (e) {
        // A few upstream tsconfig.json files are malformed; they're only needed for path aliases.
        if (!e.errors?.some(err => err.location?.file?.endsWith("tsconfig.json"))) throw e;
        return bundleWith(entry, flavor, repoDir, overrides, { tsconfigRaw: {} });
    }
}

async function bundleWith(entry, flavor, repoDir, overrides, tsconfigOptions) {
    const result = await build({
        entryPoints: [entry],
        absWorkingDir: repoDir,
        ...tsconfigOptions,
        bundle: true,
        write: false,
        format: "cjs",
        platform: "neutral",
        mainFields: ["react-native", "browser", "module", "main"],
        conditions: ["react-native", "browser", "import", "default"],
        nodePaths: [path.join(pluginsRoot, "node_modules")],
        minify: true,
        charset: "ascii",
        legalComments: "none",
        logLevel: "silent",
        supported: { "const-and-let": false },
        loader: { ".png": "dataurl", ".jpg": "dataurl", ".gif": "dataurl", ".svg": "text", ".json": "json", ".css": "text" },
        define: { "process.env.NODE_ENV": "\"production\"", ...overrides.define },
        alias: overrides.alias,
        banner: overrides.banner ? { js: overrides.banner } : undefined,
        plugins: [apiImportsPlugin(flavor), ...(overrides.imageObjects ? [imageObjectPlugin] : []), swcPlugin(overrides)],
    });
    return result.outputFiles[0].text;
}

/**
 * Turns CommonJS output into what each loader evaluates:
 * Vendetta-family loaders expect an expression returning the plugin's exports;
 * Enmity plugins just need to run (they call registerPlugin themselves).
 */
const wrap = (code) => `(function(){var module={exports:{}},exports=module.exports;${code}\nreturn module.exports})()`;

/** A Vendetta plugin that is already a built IIFE expression (no module syntax, uses the `vendetta` global). */
const isBuiltVendettaPlugin = (source) =>
    !/^\s*(import|export)\b/m.test(source) && /^\s*\(function/.test(source) && /\bvendetta\./.test(source);

function readManifest(dir, repoDir) {
    for (const file of [path.join(dir, "manifest.json"), path.join(repoDir, "manifest.json")]) {
        if (existsSync(file)) {
            try {
                return JSON.parse(readFileSync(file, "utf8"));
            } catch { }
        }
    }
    return null;
}

/** Normalizes Vendetta/Bunny/Enmity manifest shapes. */
function normalizeManifest(raw, fallbackName) {
    const authors = (raw?.authors ?? (raw?.author ? [raw.author] : [])).map(author =>
        typeof author === "string" ? { name: author } : { name: author.name ?? String(author), id: author.id });
    return {
        name: raw?.name ?? fallbackName,
        description: raw?.description ?? raw?.plugin?.description ?? "",
        authors,
        version: raw?.version ?? raw?.plugin?.version,
        icon: raw?.vendetta?.icon ?? raw?.bunny?.icon,
        // Plugins read `manifest.vendetta.icon` (settings tiles) and `manifest.bunny` at runtime.
        ...(raw?.vendetta ? { vendetta: raw.vendetta } : {}),
        ...(raw?.bunny ? { bunny: raw.bunny } : {}),
    };
}

/** builtin-plugins/README.md: what ships, who wrote it, and under which license. */
function creditsMarkdown(built) {
    const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const authors = (r) => r.manifest.authors.map(a => a.name).join(", ");
    const sourceLink = (r) => `[${r.source.repository.replace("https://github.com/", "")}](${r.source.repository}/tree/${r.source.commit}/${r.source.path === "." ? "" : r.source.path})`;
    const notes = (r) => [r.source.build === "upstream-prebuilt" ? "author's build" : "", r.status === "warning" ? `known issue: ${r.warning ?? "see list"}` : "", r.status === "legacy" ? "Enmity-era" : ""].filter(Boolean).join("; ");
    const table = (rows) => [
        "| Plugin | Authors | License | Source | Notes |",
        "| --- | --- | --- | --- | --- |",
        ...rows.map(r => `| ${cell(r.manifest.name)} | ${cell(authors(r))} | ${r.source.license} | ${sourceLink(r)} | ${cell(notes(r))} |`),
    ].join("\n");

    const recommended = JSON.parse(readFileSync(path.join(pluginsRoot, "recommended.json"), "utf8")).plugins;
    const removed = catalog.removed ?? [];
    return [
        "# Built-in plugins",
        "",
        "<!-- Generated by scripts/build-plugins.mjs. Edit catalog.json, not this file. -->",
        "",
        "Plugins that ship with Distra, disabled until enabled in Settings > Distra > Plugin Library.",
        "Each is built from the vendored source in `sources/`, pinned to the upstream commit in `catalog.json`,",
        "and remains under its author's license (the upstream `LICENSE` is kept next to each source tree).",
        "Thanks to all of the authors below.",
        "",
        "Selection: plugins marked working (or working with a known issue) in the community list at",
        "https://github.com/Purple-EyeZ/Plugins-List whose repositories carry a license, plus licensed Enmity plugins.",
        "",
        `## Vendetta / Bunny / Revenge (${built.filter(r => r.flavor === "vendetta").length})`,
        "",
        table(built.filter(r => r.flavor === "vendetta")),
        "",
        `## Enmity (${built.filter(r => r.flavor === "enmity").length})`,
        "",
        "Enmity was discontinued in 2024; these target older Discord versions and may not work.",
        "",
        table(built.filter(r => r.flavor === "enmity")),
        "",
        `## Recommended, installed from their authors (${recommended.length})`,
        "",
        "Listed in the Plugin Library but not bundled: their repositories have no license (so the code can't be redistributed) or aren't on GitHub.",
        "",
        "| Plugin | Authors | Why not bundled |",
        "| --- | --- | --- |",
        ...recommended.map(p => `| [${cell(p.name)}](${p.sourceUrl}) | ${cell(p.authors.join(", "))} | ${cell(p.reason)} |`),
        "",
        "## Built into Distra",
        "",
        "Rewritten for the current Discord as part of Distra (always available, disabled until enabled), combining the plugins below.",
        "",
        ...Object.entries(Object.groupBy(removed.filter(r => r.replacedBy?.startsWith("distra:")), r => r.replacedBy))
            .flatMap(([core, merged]) => [`- \`${core}\`: ${merged.map(r => `\`${r.id}\``).join(", ")}`]),
        "",
        "## Merged or removed",
        "",
        "Duplicates and plugins for features Discord has since removed. Merged plugins' features live on in the plugin they point to.",
        "",
        ...removed.map(r => `- \`${r.id}\`${r.replacedBy ? ` → \`${r.replacedBy}\`` : ""}: ${r.reason}`),
        "",
        "## Excluded",
        "",
        ...(catalog.excluded ?? []).map(e => `- \`${e.id}\`: ${e.reason}`),
        "",
        "## Updating",
        "",
        "```sh",
        "python3 scripts/sync-plugins.py --update   # move pins to each repository's latest commit and re-vendor",
        "pnpm build:plugins",
        "```",
        "",
    ].join("\n");
}

const results = [];
const failures = [];

for (const plugin of catalog.plugins) {
    if (filter && !plugin.id.toLowerCase().includes(filter)) continue;
    const repo = catalog.repos[plugin.repo];
    const repoDir = path.join(pluginsRoot, repo.dir);
    const dir = path.join(repoDir, plugin.path);
    const rawManifest = readManifest(dir, repoDir);
    const manifest = normalizeManifest(rawManifest, path.basename(dir === repoDir ? plugin.repo : dir));

    let code;
    let buildType = "source";
    let error;
    const entry = findEntry(dir, rawManifest);
    const overrides = REPO_OVERRIDES[plugin.repo]?.({ dir, rawManifest }) ?? {};
    const entrySource = entry ? readFileSync(entry, "utf8") : "";
    if (entry && plugin.flavor === "vendetta" && isBuiltVendettaPlugin(entrySource)) {
        // Some repos commit the deployed build as the plugin's entry; it is already the expression we need.
        code = entrySource.trim().replace(/;\s*$/, "");
        buildType = "upstream-prebuilt";
    } else if (entry) {
        try {
            code = await bundle(entry, plugin.flavor, repoDir, dir, overrides);
        } catch (e) {
            error = e.errors?.map(err => `${err.location ? `${path.relative(pluginsRoot, err.location.file)}:${err.location.line}: ` : ""}${err.text}`).join("\n") ?? String(e);
        }
    } else {
        error = "no entry file";
    }

    if (code === undefined && plugin.flavor === "enmity") {
        const prebuilt = findPrebuilt(dir, repoDir, rawManifest);
        if (prebuilt) {
            code = readFileSync(prebuilt, "utf8");
            buildType = "upstream-prebuilt";
        }
    }

    if (code === undefined) {
        failures.push({ id: plugin.id, error });
        continue;
    }

    const wrapped = buildType === "upstream-prebuilt" && plugin.flavor === "vendetta" ? `(${code})` : wrap(code);
    results.push({
        id: plugin.id,
        flavor: plugin.flavor,
        manifest,
        status: plugin.status,
        warning: plugin.warning ?? null,
        upstreamInstallUrl: plugin.upstreamInstallUrl ?? null,
        source: { repository: repo.url, commit: repo.commit, license: repo.license, path: plugin.path, build: buildType },
        hash: createHash("sha256").update(wrapped).digest("hex").slice(0, 16),
        code: wrapped,
    });
}

results.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

if (!filter) {
    const blob = JSON.stringify({ version: 1, plugins: results });
    mkdirSync(path.join(root, "dist"), { recursive: true });
    writeFileSync(path.join(root, "dist", "builtins.json"), blob);

    const generated = path.join(root, "tweak", "Sources", "Generated");
    mkdirSync(generated, { recursive: true });
    writeFileSync(path.join(generated, "builtins.json"), blob);
    writeFileSync(path.join(generated, "EmbeddedBuiltins.S"), [
        "// Generated by scripts/build-plugins.mjs. Do not edit.",
        ".section __TEXT,__const",
        ".globl _kDistraBuiltins",
        ".globl _kDistraBuiltinsEnd",
        ".p2align 3",
        "_kDistraBuiltins:",
        `.incbin "${path.join(generated, "builtins.json")}"`,
        "_kDistraBuiltinsEnd:",
        ".byte 0",
        "",
    ].join("\n"));
    writeFileSync(path.join(pluginsRoot, "README.md"), creditsMarkdown(results));
    console.log(`built ${results.length} plugins (${results.filter(r => r.source.build !== "source").length} from upstream prebuilt), ${(blob.length / 1024).toFixed(0)} KiB`);
} else {
    for (const r of results) console.log(`ok   ${r.id} (${r.source.build}, ${(r.code.length / 1024).toFixed(1)} KiB)`);
}

if (failures.length) {
    console.log(`\n${failures.length} failed:`);
    for (const f of failures) console.log(`FAIL ${f.id}\n     ${String(f.error).split("\n").slice(0, 4).join("\n     ")}`);
}
