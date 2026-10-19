// Unit tests for the theme parser, run against every Theme Library theme.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { outputFiles } = await build({
    stdin: {
        contents: `export * from "./src/lib/themes/parser"; export * from "./src/lib/themes/color"; export { LIBRARY } from "./src/lib/themes/library";`,
        resolveDir: root,
        loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{
        name: "react-native-stub",
        setup(b) {
            b.onResolve({ filter: /^react-native$/ }, () => ({ path: "rn", namespace: "stub" }));
            b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const processColor = () => null;", loader: "js" }));
        },
    }],
});
const { describeTheme, parseTheme, deriveIconColors, normalizeColor, withOpacity, LIBRARY } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

const tokens = new Set(JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/semantic-tokens-348.json"), "utf8")));
const ctx = (base = "darker", explicitBase = false) => ({ tokens, rawColor: name => ({ BRAND_500: "#5865f2" })[name], base, explicitBase });
const library = id => LIBRARY.find(entry => entry.id === id).manifest;

test("normalizes colours to #rrggbbaa", () => {
    assert.equal(normalizeColor("#abc"), "#aabbccff");
    assert.equal(normalizeColor("#ABCDEF"), "#abcdefff");
    assert.equal(normalizeColor("#11223344"), "#11223344");
    assert.equal(normalizeColor("rgba(255, 0, 0, 0.5)"), "#ff000080");
    assert.equal(normalizeColor("transparent"), "#00000000");
    assert.equal(normalizeColor(42), undefined);
    assert.equal(withOpacity("#ffffff", 0.5), "#ffffff80");
});

test("every Theme Library theme parses on every base", () => {
    assert.ok(LIBRARY.length >= 20);
    for (const entry of LIBRARY) {
        const info = describeTheme(entry.manifest);
        assert.ok(info.name, entry.id);
        for (const base of ["dark", "darker", "midnight", "light"]) {
            const definition = parseTheme(entry.manifest, ctx(base));
            const colours = Object.keys(definition.semantic).length + Object.keys(definition.raw).length;
            assert.ok(colours > 0, `${entry.id} on ${base} sets no colours`);
            for (const value of [...Object.values(definition.semantic), ...Object.values(definition.raw)]) {
                assert.match(value, /^#[0-9a-f]{8}$/, `${entry.id}: ${value}`);
            }
        }
    }
});

test("old token names carry over to current ones", () => {
    const moss = parseTheme(library("moss"), ctx("darker"));
    assert.equal(moss.semantic.BACKGROUND_BASE_LOWER, moss.semantic.BACKGROUND_PRIMARY);
    assert.equal(moss.semantic.TEXT_DEFAULT, moss.semantic.TEXT_NORMAL);
    assert.equal(moss.semantic.TEXT_STRONG, moss.semantic.HEADER_PRIMARY);
    assert.equal(moss.raw.PRIMARY_600, moss.raw.PRIMARY_DARK_600, "Enmity's PRIMARY_DARK_* become PRIMARY_*");
});

test("explicit current names win over carried-over old ones", () => {
    const theme = { spec: 2, name: "T", semanticColors: { BACKGROUND_PRIMARY: ["#111111"], BACKGROUND_BASE_LOWER: ["#222222"] } };
    assert.equal(parseTheme(theme, ctx()).semantic.BACKGROUND_BASE_LOWER, "#222222ff");
});

test("picks the dark, light, amoled or darker variant", () => {
    const theme = { spec: 2, name: "T", semanticColors: { TEXT_DEFAULT: ["#000001", "#000002", "#000003"], BACKGROUND_PRIMARY: ["#000000", "#ffffff"] } };
    assert.equal(parseTheme(theme, ctx("dark")).semantic.TEXT_DEFAULT, "#000001ff");
    assert.equal(parseTheme(theme, ctx("light")).semantic.TEXT_DEFAULT, "#000002ff");
    assert.equal(parseTheme(theme, ctx("midnight")).semantic.TEXT_DEFAULT, "#000003ff", "a theme's own amoled colours are used on Onyx");
    assert.equal(parseTheme(theme, ctx("midnight")).reference, "midnight");
    assert.equal(parseTheme(theme, ctx("darker")).semantic.TEXT_DEFAULT, "#000001ff");
});

test("old themes fall back to Ash, the base they were made for, unless a base is chosen", () => {
    assert.equal(parseTheme(library("catppuccin-mocha"), ctx("light")).reference, "dark", "dark-only themes stay dark on a light Discord");
    assert.equal(parseTheme(library("catppuccin-mocha"), ctx("midnight")).reference, "dark", "Onyx users get the theme's dark colours");
    assert.equal(parseTheme(library("catppuccin-mocha"), ctx("midnight", true)).reference, "midnight", "an explicitly chosen base wins");
    assert.equal(parseTheme(library("ember"), ctx("light")).reference, "light", "themes with light colours use them");
});

test("spec 3 references and opacity", () => {
    const night = parseTheme(library("distra-night"), ctx("midnight"));
    assert.equal(night.reference, "darker", "spec 3 dark themes fall back to Dark");
    assert.equal(night.semantic.MESSAGE_MENTIONED_BACKGROUND_DEFAULT, "#5cd6ff1a");
    assert.equal(night.semantic.BACKGROUND_BRAND, night.raw.BRAND_500, "a raw colour name resolves to the theme's own value");
    const daylight = parseTheme(library("distra-daylight"), ctx("midnight"));
    assert.equal(daylight.reference, "light", "light spec 3 themes always use the light base");
});

test("backgrounds are read from both formats", () => {
    const sunset = parseTheme(library("glorious-sunset"), ctx());
    assert.match(sunset.background.url, /^https:\/\/raw\.githubusercontent\.com\/OMetaVR\/Distra\//);
    assert.ok(parseTheme(library("purple-mountains"), ctx()).background.url);
});

test("rejects things that aren't themes", () => {
    assert.throws(() => describeTheme({ hello: "world" }), /Not a theme/);
    assert.throws(() => describeTheme([]), /Not a theme/);
    assert.throws(() => describeTheme({ spec: 2, semanticColors: {} }), /no name/);
});

test("icon tokens a theme leaves unset follow its text colours", () => {
    const all = (raw, light = raw) => ({ dark: { raw }, darker: { raw }, midnight: { raw }, light: { raw: light } });
    const stock = {
        TEXT_STRONG: all("NEUTRAL_1", "NEUTRAL_76"),
        TEXT_MUTED: all("NEUTRAL_23", "NEUTRAL_41"),
        INTERACTIVE_TEXT_DEFAULT: all("NEUTRAL_16", "NEUTRAL_47"),
        TEXT_SUBTLE: all("NEUTRAL_16", "NEUTRAL_47"),
        TABLEROW_ICON_COLOR_DEFAULT: all("NEUTRAL_1", "NEUTRAL_76"),
        ICON_MUTED: all("NEUTRAL_23", "NEUTRAL_41"),
        CHAT_INPUT_ICON_DEFAULT_TINT: all("NEUTRAL_16", "NEUTRAL_47"),
        // White on the brand-coloured send button in every theme, light included.
        CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT: all("NEUTRAL_1", "WHITE"),
        ICON_STRONG: all("NEUTRAL_1", "NEUTRAL_76"),
    };
    const derived = deriveIconColors({ TEXT_STRONG: "#111111ff", TEXT_MUTED: "#222222ff", TEXT_SUBTLE: "#444444ff", INTERACTIVE_TEXT_DEFAULT: "#333333ff", ICON_STRONG: "#555555ff" }, stock);
    assert.equal(derived.TABLEROW_ICON_COLOR_DEFAULT, "#111111ff");
    assert.equal(derived.ICON_MUTED, "#222222ff");
    assert.equal(derived.CHAT_INPUT_ICON_DEFAULT_TINT, "#333333ff", "input icons take the interactive colour");
    assert.equal(derived.CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT, undefined, "icons that differ from text in some base are left alone");
    assert.equal(derived.ICON_STRONG, undefined, "colours the theme sets are kept");
});
