import { isSafeMode } from "@/core/loader";
import { settings } from "@/core/settings";
import { useProxy } from "@/core/storage";

import { registerSection } from ".";

export function registerDistraSection() {
    registerSection("Distra", [
        {
            key: "DISTRA",
            title: () => "Distra",
            icon: "ic_badge_staff",
            render: () => import("@/ui/pages/General"),
            useTrailing: () => isSafeMode() ? "Safe mode" : DISTRA_VERSION,
        },
        {
            key: "DISTRA_PLUGINS",
            title: () => "Plugins",
            icon: "PuzzlePieceIcon",
            render: () => import("@/ui/pages/Plugins"),
        },
        {
            key: "DISTRA_PLUGIN_LIBRARY",
            title: () => "Plugin Library",
            icon: "AppsIcon",
            render: () => import("@/ui/pages/PluginLibrary"),
        },
        {
            key: "DISTRA_THEMES",
            title: () => "Themes",
            icon: "PaintbrushThinIcon",
            render: () => import("@/ui/pages/Themes"),
        },
        {
            key: "DISTRA_THEME_LIBRARY",
            title: () => "Theme Library",
            icon: "GridSquareIcon",
            render: () => import("@/ui/pages/ThemeLibrary"),
        },
        {
            key: "DISTRA_ICON_PACKS",
            title: () => "Icon Packs",
            icon: "PaintPaletteIcon",
            render: () => import("@/ui/pages/IconPacks"),
        },
        {
            key: "DISTRA_APP_ICON",
            title: () => "App Icon",
            icon: "ImageIcon",
            render: () => import("@/ui/pages/AppIcon"),
        },
        {
            key: "DISTRA_DEVELOPER",
            title: () => "Developer",
            icon: "WrenchIcon",
            render: () => import("@/ui/pages/Developer"),
            usePredicate: () => useProxy(settings).developerSettings,
        },
    ]);
}
