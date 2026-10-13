import { createFileStorage } from "@/core/storage";

export interface RadialSettings {
    width: number;
    gap: number;
    colors: { online: string; idle: string; dnd: string; streaming: string };
}

export const defaults: RadialSettings = {
    width: 2,
    gap: 1,
    colors: { online: "#23A55A", idle: "#F0B232", dnd: "#F23F43", streaming: "#593695" },
};

export let settings: RadialSettings = { ...defaults, colors: { ...defaults.colors } };

export async function loadSettings() {
    settings = await createFileStorage<RadialSettings>("plugins/data/core-radialstatus.json", defaults);
    settings.colors = { ...defaults.colors, ...settings.colors };
}
