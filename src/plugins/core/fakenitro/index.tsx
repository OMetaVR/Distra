// Fake Nitro: shows the "fake" emoji and stickers that Freemoji / FreeStickers (and Equicord's
// FakeNitro) send as image links - yours and other people's - as real emoji and stickers. Emoji
// become inline emoji nodes at the right size (tapping one opens Discord's emoji sheet), stickers
// become sticker items (tapping one opens the sticker details) and the link preview is hidden.
//
// How: Discord builds a chat row from the message record. Three places are patched:
//  - parseMessageMarkup, which parses the text. It gets a view of the message whose text has the
//    fake links swapped for `<:name:id>` / removed, so Discord's own parser makes real emoji nodes
//    (right size, jumbo when alone, animated flag).
//  - getMessageStickers, which lists a message's sticker items, so fake stickers get Discord's own
//    sticker item (url, size, accessibility strings) and its tap handler.
//  - RowManager#generate, to drop the link embeds of what was converted.
// Nothing about the message itself changes: copying text, the message log and the full-size image
// viewer still see the link. Other people still see a link; only clients with this plugin convert it.

import { ScrollView } from "react-native";

import { createFileStorage, useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByNameLazy, findByProps, findByStoreName } from "@/metro";
import { Stack, TableRow, TableRowGroup, TableSwitchRow } from "@/ui/components";

import { definePlugin } from "../types";
import { analyze, embedTarget, mayContainFakes, type Analysis, type Lookup, type Options } from "./fakes";

const logger = new Logger("FakeNitro");
const RowManager = findByNameLazy("RowManager");

const defaults = { emojis: true, stickers: true, inline: true, hideEmbeds: true };
let settings = { ...defaults };
let patcher = createPatcher("FakeNitro");

const options = (): Options => ({ emojis: settings.emojis, stickers: settings.stickers, inline: settings.inline });
const signature = () => `${settings.emojis}${settings.stickers}${settings.inline}`;

interface Cached {
    content: string;
    embeds: unknown;
    signature: string;
    analysis: Analysis;
    view?: object;
}
const cache = new WeakMap<object, Cached>();

/** What Discord knows that helps decide how to show a fake. */
function lookupFor(message: any): Lookup {
    const emojis = findByStoreName("EmojiStore");
    const stickers = findByStoreName("StickersStore");
    const embedImage = (kind: string, id: string) => {
        const embed = (Array.isArray(message.embeds) ? message.embeds : []).find((e: any) => embedTarget(e) === `${kind}/${id}`);
        return embed?.image?.srcIsAnimated ?? embed?.thumbnail?.srcIsAnimated;
    };
    return {
        emojiAnimated: id => emojis?.getCustomEmojiById?.(id)?.animated,
        sticker: id => stickers?.getStickerById?.(id),
        embedAnimated: embedImage,
    };
}

/** The fakes in `message`'s text (cached per message record, and per version of its text and embeds). */
function analysisOf(message: any): Analysis | undefined {
    const content = message?.content;
    if (!mayContainFakes(content)) return undefined;
    const hit = cache.get(message);
    if (hit && hit.content === content && hit.embeds === message.embeds && hit.signature === signature()) return hit.analysis;
    const analysis = analyze(content, options(), lookupFor(message));
    cache.set(message, { content, embeds: message.embeds, signature: signature(), analysis });
    return analysis;
}

/** A stand-in for `message` whose text is `content`; everything else is read from the message. */
function viewWithContent(message: any, analysis: Analysis) {
    const entry = cache.get(message)!;
    entry.view ??= Object.create(message, { content: { value: analysis.content, enumerable: true } });
    return entry.view;
}

function patchMarkup() {
    const markup = findByProps("parseMessageMarkup");
    if (!markup) return logger.warn("parseMessageMarkup not found; emoji won't be converted");
    // (message, contentMessage?, ...): the text comes from contentMessage when there is one.
    patcher.before("parseMessageMarkup", markup, args => {
        let changed: any[] | undefined;
        for (const index of [0, 1]) {
            const analysis = analysisOf(args[index]);
            if (!analysis || analysis.content === args[index].content) continue;
            changed ??= [...args];
            changed[index] = viewWithContent(args[index], analysis);
        }
        return changed;
    });
}

function patchStickers() {
    const utils = findByProps("getMessageStickers");
    if (!utils) return logger.warn("getMessageStickers not found; stickers won't be converted");
    patcher.after("getMessageStickers", utils, ([message]: any[], items: any) => {
        const fakes = analysisOf(message)?.stickers;
        if (!fakes?.length) return;
        const list = Array.isArray(items) ? items : [];
        const extra = fakes.filter(fake => !list.some((item: any) => item?.id === fake.id));
        return extra.length ? [...list, ...extra] : undefined;
    });
}

function patchRows() {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        if (!settings.hideEmbeds || data?.rowType !== 1 || !row?.message?.embeds?.length) return;
        const analysis = analysisOf(data.message);
        if (!analysis?.converted.size) return;
        const embeds = row.message.embeds.filter((embed: any) => !analysis.converted.has(embedTarget(embed) as string));
        if (embeds.length !== row.message.embeds.length) row.message.embeds = embeds;
    });
}

function SettingsPage() {
    useProxy(settings);
    const Switch = ({ label, subLabel, field, icon }: { label: string; subLabel?: string; field: keyof typeof defaults; icon: string }) => (
        <TableSwitchRow label={label} subLabel={subLabel} icon={<TableRow.Icon source={findAssetId(icon)} />} value={settings[field]} onValueChange={(value: boolean) => void (settings[field] = value)} />
    );
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Show as real">
                    <Switch label="Emoji" subLabel="Emoji links (Freemoji, FakeNitro) become inline emoji. Tapping one opens the emoji sheet." field="emojis" icon="ReactionIcon" />
                    <Switch label="Stickers" subLabel="Sticker links (FreeStickers, FakeNitro) become stickers. Tapping one opens the sticker details." field="stickers" icon="StickerIcon" />
                    <Switch label="Inside longer messages" subLabel="Off: only messages made of nothing but emoji or a sticker are converted." field="inline" icon="TextIcon" />
                </TableRowGroup>
                <TableRowGroup title="Link preview">
                    <Switch label="Hide the image preview" subLabel="Removes the image under a message once its link was converted." field="hideEmbeds" icon="ImageIcon" />
                </TableRowGroup>
                <TableRowGroup title="Note">
                    <TableRow label="Only for you" subLabel="Other people still see a link unless they run something similar. Changes apply to messages as they are redrawn (reopen the chat)." />
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}

export default definePlugin({
    id: "distra:fakenitro",
    manifest: {
        name: "Fake Nitro",
        description: "Shows the emoji and stickers sent as image links by Freemoji, FreeStickers and Equicord's FakeNitro as real emoji and stickers: right size, tap for the emoji sheet or sticker details.",
        authors: [{ name: "Distra" }, { name: "Equicord FakeNitro (behaviour reference)" }],
        version: "1.0.0",
    },
    async start() {
        settings = await createFileStorage("plugins/data/core-fakenitro.json", defaults);
        patcher = createPatcher("FakeNitro");
        patchMarkup();
        patchStickers();
        patchRows();
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
});
