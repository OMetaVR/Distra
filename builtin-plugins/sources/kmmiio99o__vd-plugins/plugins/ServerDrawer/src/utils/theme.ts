import { findByProps, findByStoreName } from "@vendetta/metro";

const Flux = findByProps("useStateFromStores");
const colors = findByProps("colors", "unsafe_rawColors")?.colors;
const ExpandedGuildFolderStore = findByStoreName("ExpandedGuildFolderStore");

export function useTheme() {
    return {
        text: colors?.TEXT_NORMAL ?? "#dbdee1",
        folder: "#5865f2",
        hover: colors?.STATE_LAYER_PRESS ?? "rgba(255,255,255,0.06)",
    };
}

export function useFolderExpanded(folderId: string | number): boolean {
    return Flux?.useStateFromStores?.(
        [ExpandedGuildFolderStore],
        () => {
            const folders = ExpandedGuildFolderStore?.getExpandedFolders?.();
            return folders instanceof Set ? folders.has(folderId) : false;
        },
        [folderId],
    ) ?? false;
}

export interface GuildNode {
    type: string;
    id: string | number;
    name?: string;
    color?: number | null;
    expanded?: boolean;
    children: GuildNode[];
}

const tokenRef: any = findByProps("SemanticColor");
export const Themes: any = tokenRef?.default;
const internalResolver: any = Themes?.meta ?? Themes?.internal;
const UseThemeMod: any = findByProps("useThemeIndex", "getThemeIndex");

/** A semantic colour token resolved for the current theme (light/dark), re-rendering on theme change. */
export function useTokenColor(token: any): string | undefined {
    const theme = UseThemeMod?.useTheme?.();
    if (!internalResolver || !token || theme == null) return undefined;
    return internalResolver.resolveSemanticColor(theme, token);
}

/** Colour of message text in the current theme: used for the selected-server ring. */
export function useTextColor(): string {
    return useTokenColor(Themes?.colors?.TEXT_DEFAULT ?? Themes?.colors?.TEXT_NORMAL) ?? "#dbdee1";
}

/** Colour for the thin dividers between groups of tiles. */
export function useDividerColor(): string {
    return useTokenColor(Themes?.colors?.BORDER_SUBTLE ?? Themes?.colors?.BACKGROUND_MODIFIER_ACCENT) ?? "rgba(255,255,255,0.18)";
}
