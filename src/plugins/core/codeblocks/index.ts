// Better Code Blocks: code blocks in chat look like desktop Discord's. Fenced code is tokenized by
// highlight.js (as on desktop) and coloured with desktop's code colours (or VS Code's / GitHub's /
// the theme's), inside Discord's own code box with the language as a header strip when the tweak
// has its code block hook (render.ts). Use "Copy Code" in the message's long-press menu to copy.
// Inspired by Vencord's ShikiCodeblocks (Vap).

import { callNative } from "@/core/bridge";
import { subscribe } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { interceptChatTap } from "@/lib/chatRows";
import { addMessageSheetRows } from "@/lib/messageSheet";
import { createPatcher } from "@/lib/patcher";
import { redrawMessages } from "@/lib/rowRedraw";
import { Logger } from "@/lib/logger";
import { findByProps, findByStoreName } from "@/metro";
import { clipboard } from "@/metro/common";
import { showToast } from "@/ui/toasts";

import { definePlugin } from "../types";
import { getLanguage } from "./highlight";
import { clearCaches, getHighlightedBlocks, getMessageBlocks, hasNativeHook, type NativeMode, patchRows, previewBlock, setNativeHook, TAP_ACTION } from "./render";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";

const logger = new Logger("BetterCodeBlocks");
let patcher = createPatcher("BetterCodeBlocks");
let loggedInlineTap = false;
let running = false;
let unsubscribe: (() => void) | undefined;
let removeRows: (() => void) | undefined;

interface Block { lang: string; code: string }

/** A message's code blocks, from its markdown (for messages the chat hasn't drawn yet). */
function parseBlocks(content: unknown): Block[] {
    if (typeof content !== "string" || !content.includes("```")) return [];
    return [...content.matchAll(/```(?:([\w+#.-]*)\n)?([\s\S]*?)```/g)].map(m => ({ lang: m[1] ?? "", code: m[2].replace(/\n$/, "") }));
}

function blocksOf(message: any): Block[] {
    const parsed = parseBlocks(message?.content);
    const drawn = message?.id ? getMessageBlocks(String(message.id)) : undefined;
    // Prefer the drawn code (exactly what Discord's parser produced); languages come from the markdown.
    return drawn ? drawn.map((code, i) => ({ lang: parsed[i]?.lang ?? "", code })) : parsed;
}

function copy(code: string | undefined) {
    if (code == null) return;
    clipboard.setString(code);
    showToast("Copied code", findAssetId("CopyIcon"));
}

/** Discord's "YYText replacement" experiment: message text is built in Swift instead of YYText. */
function swiftMessageText() {
    try {
        return findByProps("shouldEnableYYTextReplacement")?.shouldEnableYYTextReplacement?.({ location: "BetterCodeBlocks" }) === true;
    } catch {
        return false;
    }
}

/** What the tweak does with code blocks (DSTCodeBlocks.m, tweak 0.2+). */
async function detectNativeHook(): Promise<NativeMode> {
    try {
        const info = await Promise.race([
            callNative<{ yytext?: boolean; swift?: boolean }>("codeblocks.info"),
            new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 3000)),
        ]);
        const swift = swiftMessageText();
        logger.info("Native code block hook:", JSON.stringify(info ?? "no answer"), swift ? "(Swift message text)" : "");
        if (swift) return info?.swift ? "colors" : "none";
        return info?.yytext ? "box" : "none";
    } catch (e) {
        logger.info("No native code block hook; highlighted code is drawn as message text:", (e as Error)?.message ?? String(e));
        return "none";
    }
}

const tapData = (event: any) => {
    const data = event?.data ?? event?.target ?? event;
    return data?.action === TAP_ACTION ? data : undefined;
};

/** Redraws the open chat's messages that contain code. */
function redrawOpenChat() {
    const channelId = findByStoreName("SelectedChannelStore")?.getChannelId?.();
    const messages = channelId && findByStoreName("MessageStore")?.getMessages?.(channelId);
    const list: any[] = messages?._array ?? messages?.toArray?.() ?? [];
    const ids = list.filter(m => typeof m?.content === "string" && m.content.includes("```")).map(m => m.id);
    if (ids.length) redrawMessages(channelId, ids);
}

/** Long-pressing highlighted code opens the message's menu, as on any other message text. */
function patchLongPress() {
    const module = findByProps("MessagesHandlers");
    if (typeof module?.MessagesHandlers !== "function") return;
    patcher.after("MessagesHandlers", module, (_args: any[], instance: any) => {
        const original = instance?.handleLongPressLink;
        if (typeof original !== "function") return;
        instance.handleLongPressLink = function (this: unknown, ...args: any[]) {
            const data = running ? tapData(args[0]?.nativeEvent) : undefined;
            if (data?.messageId && typeof instance.handleLongPressMessage === "function") {
                return instance.handleLongPressMessage({ nativeEvent: { messageId: data.messageId } });
            }
            return original.apply(this, args);
        };
    });
}

export default definePlugin({
    id: "distra:better-code-blocks",
    manifest: {
        name: "Better Code Blocks",
        description: "Desktop-style syntax highlighting (highlight.js, desktop's colours) inside Discord's code box, with the language as a header. Copy a block from the message menu.",
        authors: [{ name: "Distra" }, { name: "Vap (ShikiCodeblocks, inspiration)" }, { name: "highlight.js (Ivan Sagalaev and contributors)" }],
        version: "2.0.0",
    },

    async start() {
        await loadSettings();
        setNativeHook(await detectNativeHook());
        patcher = createPatcher("BetterCodeBlocks");
        running = true;
        patchRows(patcher);
        // Our links are ours to handle even with tap-to-copy off: Discord has no action for them.
        interceptChatTap(patcher, "handleTapLink", () => running, event => {
            const data = tapData(event);
            if (!data) return false;
            if (settings.tapToCopy) copy(getMessageBlocks(String(data.messageId))?.[data.block]);
            return true;
        });
        // Highlighted code is made of inline code runs, which copy themselves when tapped: copy the
        // whole block instead (when the event says which message it is in).
        interceptChatTap(patcher, "handleTapInlineCode", () => running && settings.highlight && settings.monospace, event => {
            if (!loggedInlineTap) {
                loggedInlineTap = true;
                logger.info("Inline code tap event keys:", Object.keys(event ?? {}).join(", "));
            }
            const messageId = event?.messageId ?? event?.data?.messageId;
            const content = event?.node?.content;
            if (!messageId || typeof content !== "string") return false;
            const block = getHighlightedBlocks(String(messageId)).find(code => code.includes(content));
            if (block == null) return false;
            if (settings.tapToCopy) copy(block);
            return true;
        });
        patchLongPress();
        removeRows = addMessageSheetRows(message => {
            if (!settings.copyMenu) return null;
            const blocks = blocksOf(message);
            return blocks.slice(0, 5).map((block, i) => {
                const name = getLanguage(block.lang)?.name ?? block.lang;
                const label = blocks.length > 1 ? `Copy Code Block ${i + 1}${name ? ` (${name})` : ""}` : "Copy Code";
                return { key: `distra-copy-code-${i}`, label, icon: "CopyIcon", onPress: () => copy(block.code) };
            });
        });
        unsubscribe = subscribe(settings, () => {
            clearCaches();
            redrawOpenChat();
        });
        redrawOpenChat();
    },

    stop() {
        running = false;
        unsubscribe?.();
        removeRows?.();
        unsubscribe = removeRows = undefined;
        patcher.unpatchAll();
        clearCaches();
        redrawOpenChat();
    },

    SettingsComponent: SettingsPage,
    api: { parseBlocks, getMessageBlocks, redrawOpenChat, previewBlock, hasNativeHook },
});
