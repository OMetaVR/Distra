import { isSafeMode } from "@/core/loader";
import { settings } from "@/core/settings";
import { useProxy } from "@/core/storage";

import { registerSection } from ".";

export function registerDiscordiaSection() {
    registerSection("Discordia", [
        {
            key: "DISCORDIA",
            title: () => "Discordia",
            icon: "ic_badge_staff",
            render: () => import("@/ui/pages/General"),
            useTrailing: () => isSafeMode() ? "Safe mode" : DISCORDIA_VERSION,
        },
        {
            key: "DISCORDIA_PLUGINS",
            title: () => "Plugins",
            icon: "PuzzlePieceIcon",
            render: () => import("@/ui/pages/Plugins"),
        },
        {
            key: "DISCORDIA_PLUGIN_LIBRARY",
            title: () => "Plugin Library",
            icon: "AppsIcon",
            render: () => import("@/ui/pages/PluginLibrary"),
        },
        {
            key: "DISCORDIA_ICON_PACKS",
            title: () => "Icon Packs",
            icon: "PaintPaletteIcon",
            render: () => import("@/ui/pages/IconPacks"),
        },
        {
            key: "DISCORDIA_APP_ICON",
            title: () => "App Icon",
            icon: "ImageIcon",
            render: () => import("@/ui/pages/AppIcon"),
        },
        {
            key: "DISCORDIA_DEVELOPER",
            title: () => "Developer",
            icon: "WrenchIcon",
            render: () => import("@/ui/pages/Developer"),
            usePredicate: () => useProxy(settings).developerSettings,
        },
    ]);
}
