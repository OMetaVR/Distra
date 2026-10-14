// Unit tests for the fake emoji / sticker link parser of the Fake Nitro core plugin.

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { outputFiles } = await build({
    entryPoints: [path.join(root, "src/plugins/core/fakenitro/fakes.ts")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
});
const { analyze, embedTarget, mayContainFakes } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

const all = { emojis: true, stickers: true, inline: true };
const none = { emojiAnimated: () => undefined, sticker: () => undefined, embedAnimated: () => undefined };
const emoji = (id, query = "size=48&quality=lossless&name=shrug", ext = "webp") => `https://cdn.discordapp.com/emojis/${id}.${ext}?${query}`;
const sticker = (id, ext = "png") => `https://media.discordapp.net/stickers/${id}.${ext}?size=160`;

test("Freemoji's masked link becomes an emoji", () => {
    const result = analyze(`[shrug](${emoji("1152662202222915694")})`, all, none);
    assert.equal(result.content, "<:shrug:1152662202222915694>");
    assert.equal(result.emojis, 1);
    assert.ok(result.converted.has("emojis/1152662202222915694"));
});

test("a bare link works, inside a sentence, using the name parameter", () => {
    const result = analyze(`hi ${emoji("111", "size=48&name=party_time")} there <${emoji("222", "name=b")}>`, all, none);
    assert.equal(result.content, "hi <:party_time:111> there <:b:222>");
});

test("animated: gif extension, animated=true, the emoji store, or the embed", () => {
    assert.equal(analyze(emoji("1", "name=a", "gif"), all, none).content, "<a:a:1>");
    assert.equal(analyze(emoji("1", "name=a&animated=true"), all, none).content, "<a:a:1>");
    assert.equal(analyze(emoji("1", "name=a"), all, { ...none, emojiAnimated: () => true }).content, "<a:a:1>");
    assert.equal(analyze(emoji("1", "name=a"), all, { ...none, embedAnimated: () => true }).content, "<a:a:1>");
    assert.equal(analyze(emoji("1", "name=a"), all, { ...none, emojiAnimated: () => false, embedAnimated: () => true }).content, "<:a:1>");
});

test("names are made safe for the emoji syntax", () => {
    assert.equal(analyze(`[my emoji!](${emoji("5", "size=48")})`, all, none).content, "<:my_emoji:5>");
    assert.equal(analyze(`[](${emoji("5", "size=48")})`, all, none).content, "<:emoji:5>");
});

test("stickers leave the text and become sticker items", () => {
    const result = analyze(`[Wave](${sticker("749")})`, all, none);
    assert.equal(result.content, "");
    assert.deepEqual(result.stickers, [{ id: "749", name: "Wave", format_type: 1 }]);
    assert.ok(result.converted.has("stickers/749"));
});

test("sticker format: gif link, known sticker, animated embed", () => {
    assert.equal(analyze(sticker("1", "gif"), all, none).stickers[0].format_type, 4);
    assert.equal(analyze(sticker("1"), all, { ...none, sticker: () => ({ name: "Real", format_type: 3 }) }).stickers[0].format_type, 3);
    assert.equal(analyze(sticker("1"), all, { ...none, sticker: () => ({ name: "Real", format_type: 3 }) }).stickers[0].name, "Real");
    assert.equal(analyze(sticker("1"), all, { ...none, embedAnimated: () => true }).stickers[0].format_type, 2);
    assert.equal(analyze(sticker("1") + "&name=Spin", all, none).stickers[0].name, "Spin");
});

test("a bare link is not read twice when it is inside a masked link", () => {
    const result = analyze(`[a](${emoji("9", "size=48")}) [b](${emoji("8", "size=48")})`, all, none);
    assert.equal(result.content, "<:a:9> <:b:8>");
    assert.equal(result.emojis, 2);
});

test("inline off converts only messages made of nothing else", () => {
    const only = { ...all, inline: false };
    assert.equal(analyze(`[a](${emoji("9", "size=48")}) [b](${emoji("8", "size=48")})`, only, none).content, "<:a:9> <:b:8>");
    const mixed = `look ${emoji("9")} here`;
    assert.equal(analyze(mixed, only, none).content, mixed);
    assert.equal(analyze(mixed, only, none).converted.size, 0);
});

test("options switch emoji and stickers off separately", () => {
    const text = `${emoji("9")} ${sticker("7")}`;
    assert.equal(analyze(text, { ...all, emojis: false }, none).emojis, 0);
    assert.equal(analyze(text, { ...all, stickers: false }, none).stickers.length, 0);
    assert.equal(analyze(text, { ...all, stickers: false }, none).content, `<:shrug:9> ${sticker("7")}`);
});

test("other links are left alone", () => {
    for (const text of [
        "https://example.com/emojis/12.png",
        "https://cdn.discordapp.com/attachments/1/2/3.png",
        "https://cdn.discordapp.com/emojis/abc.png",
        "plain text",
    ]) {
        const result = analyze(text, all, none);
        assert.equal(result.content, text);
        assert.equal(result.converted.size, 0);
    }
});

test("embedTarget and mayContainFakes", () => {
    assert.equal(embedTarget({ url: emoji("12") }), "emojis/12");
    assert.equal(embedTarget({ url: "https://example.com/x", image: { url: "https://images-ext-1.discordapp.net/external/abc/%3Fsize%3D48/https/cdn.discordapp.com/emojis/640.webp" } }), "emojis/640");
    assert.equal(embedTarget({ url: "https://example.com/x" }), undefined);
    assert.ok(mayContainFakes(emoji("1")));
    assert.ok(!mayContainFakes("hello"));
    assert.ok(!mayContainFakes(undefined));
});
