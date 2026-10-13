import { createFileStorage } from "@/core/storage";

export interface IndicatorSettings {
    memberList: boolean;
    dmList: boolean;
    dmHeader: boolean;
    profile: boolean;
    /** Show an icon even when the user is only on one platform. */
    showSinglePlatform: boolean;
    colors: { online: string; idle: string; dnd: string; streaming: string; offline: string };
}

export const defaults: IndicatorSettings = {
    memberList: true,
    dmList: true,
    dmHeader: true,
    profile: true,
    showSinglePlatform: true,
    colors: { online: "#23A55A", idle: "#F0B232", dnd: "#F23F43", streaming: "#593695", offline: "#80848E" },
};

export let settings: IndicatorSettings = { ...defaults, colors: { ...defaults.colors } };

export async function loadSettings() {
    settings = await createFileStorage<IndicatorSettings>("plugins/data/core-platformindicators.json", defaults);
    settings.colors = { ...defaults.colors, ...settings.colors };
}
