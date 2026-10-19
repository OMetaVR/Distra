import { createFileStorage } from "@/core/storage";

export interface FolderIcon {
    /** An image URL, or a data: URI for a picture picked from Photos. */
    url: string;
    /** Percent of the folder tile the image covers (100 fills it). */
    size: number;
}

export interface CustomFolderIconsSettings {
    /** Folder id -> its icon. */
    icons: Record<string, FolderIcon>;
    /** The folder's colour behind the image at full strength instead of faded. */
    solidBackground: boolean;
}

export const defaults: CustomFolderIconsSettings = { icons: {}, solidBackground: false };

export let settings: CustomFolderIconsSettings = { ...defaults, icons: {} };

export async function loadSettings() {
    settings = await createFileStorage<CustomFolderIconsSettings>("plugins/data/core-customfoldericons.json", defaults);
    settings.icons ??= {};
}

export const SIZES = [{ label: "Fill", value: 100 }, { label: "Large", value: 80 }, { label: "Medium", value: 60 }];
