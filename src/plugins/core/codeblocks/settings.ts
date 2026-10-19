import { createFileStorage } from "@/core/storage";

import type { PaletteId } from "./palettes";

export const defaults = {
    /** Colour code blocks by their fence language. */
    highlight: true,
    /** Colours: desktop Discord's, VS Code's, GitHub's, or built from the current theme. */
    palette: "discord" as PaletteId,
    /**
     * Without the tweak's code block hook: draw highlighted code in Discord's code font. Each
     * coloured token then is its own inline code run, which iOS pads with a thin space on both
     * sides and gives its own background.
     */
    monospace: false,
    /** The language as a header in the box (or a small label above it without the tweak hook). */
    header: true,
    /** "JavaScript" rather than the fence tag ("js"). */
    fullName: true,
    /** Tapping the label or highlighted code copies the block. */
    tapToCopy: true,
    /** "Copy Code" in the message long-press menu. */
    copyMenu: true,
};

export type CodeBlockSettings = typeof defaults;

export let settings: CodeBlockSettings = { ...defaults };

export async function loadSettings() {
    settings = await createFileStorage<CodeBlockSettings>("plugins/data/core-codeblocks.json", defaults);
    return settings;
}
