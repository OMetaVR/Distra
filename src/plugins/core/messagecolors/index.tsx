// Message Colors: color codes in messages (#FF0042, #39f, rgb(...), rgba(...), hsl(...)) are drawn
// in their color, or get a colored block next to them. Tapping one copies its hex value.
// Ported from Vencord's MessageColors (Hen). Chat rows are rewritten as Discord builds them
// (RowManager#generate): plain text nodes are split around the codes, which become colored links.
// Code blocks, inline code, links and mentions are left alone.

import { ScrollView } from "react-native";

import { createFileStorage, useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { coloredNode, interceptChatTap, mapTextNodes, MESSAGE_ROW, RowManager, textNode } from "@/lib/chatRows";
import { createPatcher } from "@/lib/patcher";
import { clipboard } from "@/metro/common";
import { Stack, TableRadioGroup, TableRadioRow, TableRow, TableRowGroup, TableSwitchRow, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { definePlugin } from "../types";
import { findColors } from "./colors";

type RenderType = "foreground" | "block";
type BlockSide = "left" | "right" | "both";

const defaults = { renderType: "foreground" as RenderType, blockView: "right" as BlockSide, enableShortHexCodes: true };
let settings = { ...defaults };

const TAP_ACTION = "distraMessageColor";
const BLOCK = "■";

let patcher = createPatcher("MessageColors");
let running = false;

function colorize(node: any, message: any): any[] | undefined {
    const text: string = node.content;
    const found = findColors(text, settings.enableShortHexCodes);
    if (!found.length) return undefined;

    const out: any[] = [];
    let last = 0;
    for (const color of found) {
        if (color.index > last) out.push(textNode(text.slice(last, color.index)));
        const payload = { action: TAP_ACTION, color: color.hex, messageId: message.id, messageChannelId: message.channelId };
        const block = () => coloredNode([textNode(BLOCK)], color.hex, payload);
        if (settings.renderType === "foreground") {
            out.push(coloredNode([textNode(color.text)], color.hex, payload));
        } else {
            if (settings.blockView !== "right") out.push(block(), textNode(" "));
            out.push(textNode(color.text));
            if (settings.blockView !== "left") out.push(textNode(" "), block());
        }
        last = color.index + color.text.length;
    }
    if (last < text.length) out.push(textNode(text.slice(last)));
    return out;
}

function onTapLink(event: any) {
    const data = event?.data ?? event?.target ?? event;
    if (data?.action !== TAP_ACTION || typeof data.color !== "string") return false;
    clipboard.setString(data.color);
    showToast(`Copied ${data.color}`, findAssetId("CopyIcon"));
    return true;
}

function SettingsPage() {
    useProxy(settings);
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRadioGroup title="Show colors as" value={settings.renderType} onChange={(value: RenderType) => void (settings.renderType = value)}>
                    <TableRadioRow label="Colored text" subLabel="The code itself is drawn in its color" value="foreground" />
                    <TableRadioRow label="Colored block" subLabel={`A ${BLOCK} in the color next to the code, readable on any background`} value="block" />
                </TableRadioGroup>
                {settings.renderType === "block" && (
                    <TableRadioGroup title="Block position" value={settings.blockView} onChange={(value: BlockSide) => void (settings.blockView = value)}>
                        <TableRadioRow label="Right side" value="right" />
                        <TableRadioRow label="Left side" value="left" />
                        <TableRadioRow label="Both sides" value="both" />
                    </TableRadioGroup>
                )}
                <TableRowGroup title="Codes">
                    <TableSwitchRow
                        label="Short hex codes"
                        subLabel="Also color 3-digit codes like #39f"
                        icon={<TableRow.Icon source={findAssetId("PaintPaletteIcon")} />}
                        value={settings.enableShortHexCodes}
                        onValueChange={(value: boolean) => void (settings.enableShortHexCodes = value)}
                    />
                </TableRowGroup>
                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Tap a colored code to copy its hex value (reopen a chat after enabling). Changes apply as messages redraw.
                </Text>
            </Stack>
        </ScrollView>
    );
}

export default definePlugin({
    id: "distra:message-colors",
    manifest: {
        name: "Message Colors",
        description: "Shows color codes in messages (#FF0042, rgb(...), hsl(...)) in their color. Tap one to copy it.",
        authors: [{ name: "Distra" }, { name: "Hen (MessageColors)" }],
        version: "1.0.0",
    },

    async start() {
        settings = await createFileStorage("plugins/data/core-messagecolors.json", defaults);
        patcher = createPatcher("MessageColors");
        running = true;
        patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
            if (data?.rowType !== MESSAGE_ROW || !Array.isArray(row?.message?.content)) return;
            row.message.content = mapTextNodes(row.message.content, node => colorize(node, row.message));
        });
        interceptChatTap(patcher, "handleTapLink", () => running, onTapLink);
    },

    stop() {
        running = false;
        patcher.unpatchAll();
    },

    SettingsComponent: SettingsPage,
});
