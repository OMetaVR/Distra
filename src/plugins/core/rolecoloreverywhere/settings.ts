import { createFileStorage } from "@/core/storage";

export interface RoleColorSettings {
    chatMentions: boolean;
    memberList: boolean;
    voiceUsers: boolean;
    reactorsList: boolean;
    colorChatMessages: boolean;
    /** 0-100: how much of the role color is mixed into message text. */
    messageSaturation: number;
}

export const defaults: RoleColorSettings = {
    chatMentions: true,
    memberList: true,
    voiceUsers: true,
    reactorsList: true,
    colorChatMessages: false,
    messageSaturation: 30,
};

export let settings: RoleColorSettings = { ...defaults };

export async function loadSettings() {
    settings = await createFileStorage<RoleColorSettings>("plugins/data/core-rolecoloreverywhere.json", defaults);
}
