// Folder icons, and the folders they can be set on.

import { findByProps, findByStoreName } from "@/metro";

import { type FolderIcon, settings } from "./settings";

const SortedGuildStore = findByStoreName("SortedGuildStore");

const listeners = new Set<() => void>();
/** Re-renders folders showing an icon after a change. */
export const onIconsChanged = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));
const changed = () => listeners.forEach(listener => listener());

export const getIcon = (folderId: string | number | undefined): FolderIcon | undefined =>
    folderId == null ? undefined : settings.icons[String(folderId)] ?? undefined;

export function setIcon(folderId: string | number, icon: FolderIcon) {
    settings.icons = { ...settings.icons, [String(folderId)]: icon };
    changed();
}

export function resetIcon(folderId: string | number) {
    const { [String(folderId)]: _, ...rest } = settings.icons;
    settings.icons = rest;
    changed();
}

export function resetAll() {
    settings.icons = {};
    changed();
}

export function setSolidBackground(solid: boolean) {
    settings.solidBackground = solid;
    changed();
}

export interface Folder {
    id: string;
    name?: string;
    color?: number | null;
    guildIds: string[];
}

/** Your server folders, in guild list order. */
export function folders(): Folder[] {
    const list: any[] = SortedGuildStore?.getGuildFolders?.() ?? [];
    return list
        .filter(folder => folder?.folderId != null)
        .map(folder => ({ id: String(folder.folderId), name: folder.folderName, color: folder.folderColor, guildIds: folder.guildIds ?? [] }));
}

export const getFolder = (id: string | number) => folders().find(folder => folder.id === String(id));

/** Discord's colour for folders without one. */
export function folderColor(color: number | null | undefined): string {
    const value = color ?? findByProps("DEFAULT_FOLDER_COLOR")?.DEFAULT_FOLDER_COLOR ?? 0x5865f2;
    return `#${Number(value).toString(16).padStart(6, "0")}`;
}
