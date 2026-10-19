// Custom Folder Icons: give a server folder an image (a link, or a picture from Photos) shown instead of the
// mini server grid while it's closed. Port of Equicord's CustomFolderIcons (GPL-3.0-or-later, by sadan) for
// mobile:
//
//   - "Change Icon" joins a folder's long-press menu (getGuildFolderMenuItems, which Discord's server list
//     and Server Drawer both build their menus from);
//   - Discord's server list: the closed folder's preview (GuildsBarGuildFolder) is swapped for the image;
//   - Server Drawer draws its folders itself and asks `api.FolderIcon` for the icon.

import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath, findByProps, findByPropsLazy } from "@/metro";
import { tokens } from "@/metro/common";

import { definePlugin } from "../types";
import * as data from "./data";
import { openEditor } from "./EditorSheet";
import { FolderIconView } from "./FolderIconView";
import SettingsPage from "./SettingsPage";
import { loadSettings } from "./settings";

const logger = new Logger("CustomFolderIcons");
let patcher = createPatcher("CustomFolderIcons");
const designHub = findByPropsLazy("useToken");

/** A Discord icon component for the menu row (menu items take components, not asset ids). */
function menuIcon() {
    for (const name of ["ImageIcon", "ImagePlusIcon", "PencilIcon"]) {
        const Icon = findByProps(name)?.[name];
        if (Icon) return Icon;
    }
    return undefined;
}

/** A closed folder's preview in Discord's server list, or its custom icon (same size as a server icon). */
function GuildsBarFolderIcon({ folderId, color, children }: { folderId: string | number; color?: number | null; children: React.ReactNode }) {
    const size = designHub.useToken?.(tokens.modules?.mobile?.GUILD_BAR_ITEM_SIZE);
    if (typeof size !== "number") return <>{children}</>;
    return <FolderIconView folderId={folderId} color={color} size={size} radius={Math.round(size / 3)}>{children}</FolderIconView>;
}

/** Wraps the folder's server preview ({ type: "preview", guilds }) in GuildsBarFolderIcon. */
function wrapPreview(node: any, folder: { id: string | number; color?: number | null }, depth = 0): any {
    if (!node || typeof node !== "object" || depth > 12) return node;
    if (Array.isArray(node)) {
        const next = node.map(child => wrapPreview(child, folder, depth + 1));
        return next.some((child, i) => child !== node[i]) ? next : node;
    }
    if (node.props?.type === "preview" && Array.isArray(node.props.guilds)) {
        return <GuildsBarFolderIcon key={node.key ?? undefined} folderId={folder.id} color={folder.color}>{node}</GuildsBarFolderIcon>;
    }
    const children = node.props?.children;
    if (children == null || typeof children !== "object") return node;
    const next = wrapPreview(children, folder, depth + 1);
    return next === children ? node : { ...node, props: { ...node.props, children: next } };
}

function patchGuildsBar() {
    const folder = findByFilePath("modules/guilds_bar/native/GuildsBarGuildFolder.tsx")?.default;
    if (typeof folder?.type !== "function") return logger.warn("Server list folders not found; icons only show in Server Drawer");
    patcher.after("type", folder, ([props], tree) => props?.id == null ? tree : wrapPreview(tree, props));
}

function patchFolderMenu() {
    const menu = findByFilePath("modules/guilds_bar/native/GuildsBarFolderMenuItems.tsx");
    if (typeof menu?.getGuildFolderMenuItems !== "function") return logger.warn("Folder menu not found; use the plugin's settings to set icons");
    const IconComponent = menuIcon();
    patcher.after("getGuildFolderMenuItems", menu, ([folderId], items) => {
        if (!Array.isArray(items) || folderId == null) return;
        return [...items, { IconComponent, label: "Change Icon", action: () => openEditor(folderId) }];
    });
}

export default definePlugin({
    id: "distra:custom-folder-icons",
    manifest: {
        name: "Custom Folder Icons",
        description: "Give server folders a custom image instead of the server grid. Hold a folder and choose Change Icon.",
        authors: [{ name: "Distra" }, { name: "sadan (Equicord CustomFolderIcons)" }],
        version: "1.0.0",
    },
    async start() {
        await loadSettings();
        patcher = createPatcher("CustomFolderIcons");
        for (const [what, patch] of [["the folder menu", patchFolderMenu], ["server list folders", patchGuildsBar]] as const) {
            try {
                patch();
            } catch (e) {
                logger.error(`Couldn't patch ${what}`, e);
            }
        }
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
    api: { ...data, openEditor, FolderIcon: FolderIconView },
});
