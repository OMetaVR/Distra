// Bundles src/ into dist/distra.js and embeds it into the tweak.
//
//   node scripts/build.mjs             development build (unminified, __DEV__ = true)
//   node scripts/build.mjs --release   minified release build
//   node scripts/build.mjs --no-embed  skip generating tweak/Sources/Generated
//   node scripts/build.mjs --watch     rebuild on change (used by scripts/serve.mjs)

import swc from "@swc/core";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const release = args.has("--release");
const embed = !args.has("--no-embed");
const watch = args.has("--watch");

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const commit = (() => {
    try {
        return execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
        return "local";
    }
})();

const outfile = path.join(root, "dist", "distra.js");

// Discord ships its own copies of these inside the Metro bundle; we resolve them
// lazily at runtime instead of bundling a second React into the app.
const metroDeps = ["react", "react-native"];

/** @type {import("esbuild").Plugin} */
const metroDepsPlugin = {
    name: "metro-deps",
    setup(b) {
        const filter = new RegExp(`^(${metroDeps.join("|")})$`);
        b.onResolve({ filter }, ({ path: name }) => ({ path: name, namespace: "metro-dep" }));
        b.onLoad({ filter: /.*/, namespace: "metro-dep" }, ({ path: name }) => ({
            contents: `module.exports = require(${JSON.stringify(path.join(root, "shims/deps.ts"))}).default[${JSON.stringify(name)}];`,
            loader: "js",
            resolveDir: root,
        }));
        b.onResolve({ filter: /^react\/jsx-(dev-)?runtime$/ }, () => ({ path: path.join(root, "shims/jsxRuntime.ts") }));
    },
};

/** @type {import("esbuild").Plugin} */
const swcPlugin = {
    name: "swc",
    setup(b) {
        b.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async ({ path: file }) => {
            if (file.includes(`${path.sep}node_modules${path.sep}@swc${path.sep}helpers`)) return;
            const result = await swc.transformFile(file, {
                jsc: {
                    externalHelpers: true,
                    parser: { syntax: "typescript", tsx: file.endsWith("x") },
                    transform: { react: { runtime: "automatic" } },
                },
                // Hermes lacks native support for these, everything else is left to Hermes.
                // https://github.com/facebook/hermes/blob/main/doc/Features.md
                env: {
                    targets: "fully supports es6",
                    include: [
                        "transform-block-scoping",
                        "transform-classes",
                        "transform-async-to-generator",
                        "transform-async-generator-functions",
                    ],
                    exclude: [
                        "transform-parameters",
                        "transform-template-literals",
                        "transform-exponentiation-operator",
                        "transform-named-capturing-groups-regex",
                        "transform-nullish-coalescing-operator",
                        "transform-object-rest-spread",
                        "transform-optional-chaining",
                        "transform-logical-assignment-operators",
                    ],
                },
            });
            return { contents: result.code, loader: "js" };
        });
    },
};

/** @type {import("esbuild").BuildOptions} */
const options = {
    absWorkingDir: root,
    entryPoints: ["src/entry.ts"],
    outfile,
    bundle: true,
    format: "iife",
    platform: "neutral",
    mainFields: ["main", "module"],
    minify: release,
    legalComments: "none",
    charset: "ascii",
    supported: {
        // Hermes parses let/const but treats them like var; swc lowers them anyway.
        "const-and-let": false,
    },
    define: {
        window: "globalThis",
        __DEV__: JSON.stringify(!release),
        DISTRA_VERSION: JSON.stringify(pkg.version),
        DISTRA_COMMIT: JSON.stringify(commit),
        DISTRA_BUILT_AT: JSON.stringify(new Date().toISOString()),
    },
    loader: { ".png": "dataurl" },
    footer: { js: "//# sourceURL=distra" },
    plugins: [metroDepsPlugin, swcPlugin, embedPlugin()],
    logLevel: "info",
};

function embedPlugin() {
    return {
        name: "embed",
        setup(b) {
            b.onEnd(result => {
                if (result.errors.length) return;
                const size = readFileSync(outfile).length;
                console.log(`distra ${pkg.version} (${commit}) ${release ? "release" : "dev"} — ${(size / 1024).toFixed(1)} KiB`);
                if (embed) writeEmbeddedBundle();
            });
        },
    };
}

// The tweak embeds the bundle as a byte array so it works the same whether it
// is installed as a .deb or injected into an IPA (no resource bundle lookup).
function writeEmbeddedBundle() {
    const bytes = readFileSync(outfile);
    const dir = path.join(root, "tweak", "Sources", "Generated");
    mkdirSync(dir, { recursive: true });

    const lines = [];
    for (let i = 0; i < bytes.length; i += 24) {
        lines.push(Array.from(bytes.subarray(i, i + 24), byte => `0x${byte.toString(16).padStart(2, "0")}`).join(","));
    }

    writeFileSync(path.join(dir, "EmbeddedBundle.c"), [
        "// Generated by scripts/build.mjs. Do not edit.",
        "#include <stddef.h>",
        `const char *const kDistraBundleVersion = ${JSON.stringify(`${pkg.version}+${commit}`)};`,
        `const unsigned char kDistraBundle[] = {\n${lines.join(",\n")}\n};`,
        "const size_t kDistraBundleLength = sizeof(kDistraBundle);",
        "",
    ].join("\n"));
}

if (watch) {
    const ctx = await context(options);
    await ctx.watch();
} else {
    await build(options);
}
