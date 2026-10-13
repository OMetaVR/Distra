// Home screen app icon. iOS only allows switching to alternate icons declared
// in Info.plist; IPA builds add Discordia's icons alongside Discord's own.

import { callNative } from "@/core/bridge";

export interface AppIconInfo {
    /** Currently selected alternate icon, or null for the primary icon. */
    current: string | null;
    supported: boolean;
    icons: Array<{ name: string; files: string[] }>;
}

export const getAppIcons = () => callNative<AppIconInfo>("appicon.list");
export const setAppIcon = (name: string | null) => callNative<void>("appicon.set", name);
