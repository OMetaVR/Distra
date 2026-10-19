// Font Loader: replace Discord's fonts with Google Fonts or any .ttf/.otf from a link, for text,
// headings and code. Port of Equicord's FontLoader (GPL-3.0-or-later, by vmohammad) for mobile.
//
// Desktop swaps CSS font variables; on iOS a font has to be registered with CoreText before UIKit or
// React Native can use it, and Discord's text (natively drawn chat rows included) asks UIKit for its
// fonts by name. So the files are downloaded here and the tweak (tweak/Sources/DSTFonts.m) registers
// them and answers Discord's font names (ggsans-Medium, ggmono-Normal, ...) with the replacements.
// The tweak saves the choice and applies it at launch, before anything is drawn.
//
// Each font can be resized (by hand, or matched to gg sans's letter size), shifted to a lighter or
// heavier installed weight, and spaced out. Sizes and chat line spacing are applied by the tweak
// (newer than 0.1.1); React Native text gets its line spacing from Discord's text styles (fonts.ts).

import { Logger } from "@/lib/logger";
import { getRecord } from "@/plugins/manager";

import { definePlugin } from "../types";
import * as fonts from "./fonts";
import { applyFonts, checkNativeSupport, clearFonts } from "./fonts";
import { loadSettings } from "./settings";
import SettingsPage from "./SettingsPage";

const logger = new Logger("FontLoader");
const ID = "distra:font-loader";

export default definePlugin({
    id: ID,
    manifest: {
        name: "Font Loader",
        description: "Use any Google Font, or a .ttf/.otf from a link, for Discord's text, headings and code, with its own size, weight and line spacing.",
        authors: [{ name: "Distra" }, { name: "vmohammad (Equicord FontLoader)" }],
        version: "1.1.0",
    },
    async start() {
        await loadSettings();
        if (await checkNativeSupport() !== "ok") return void logger.warn("The installed Distra tweak can't load fonts; update it to use Font Loader");
        // The tweak already applied the saved choice at launch; this keeps it in step with the settings.
        await applyFonts().catch(e => logger.error("Couldn't apply fonts", e));
    },
    async stop() {
        // Only when disabled: a stop for any other reason shouldn't forget the fonts for the next launch.
        if (getRecord(ID)?.enabled === false) await clearFonts().catch(e => logger.error("Couldn't restore Discord's fonts", e));
    },
    SettingsComponent: SettingsPage,
    api: fonts,
});
