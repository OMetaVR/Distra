import { createFileStorage } from "@/core/storage";

export interface ClickableRolesSettings {
    /** Tapping a role pill in a member's profile opens the role sheet. */
    profileRoles: boolean;
    /** Tapping a role mention in chat opens the role sheet (instead of Discord's member list, which it links to). */
    roleMentions: boolean;
}

export const defaults: ClickableRolesSettings = { profileRoles: true, roleMentions: true };

export let settings: ClickableRolesSettings = { ...defaults };

export async function loadSettings() {
    settings = await createFileStorage<ClickableRolesSettings>("plugins/data/core-clickableroles.json", defaults);
}
