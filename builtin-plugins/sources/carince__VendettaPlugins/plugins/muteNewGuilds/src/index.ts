import { findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { after } from "@vendetta/patcher";
import { invites } from "@vendetta/metro/common";
import Settings from "./Settings";

const { updateGuildNotificationSettings } = findByProps("updateGuildNotificationSettings");
const UserGuildSettingsStore = findByStoreName("UserGuildSettingsStore");

storage.server ??= false;
storage.everyone ??= true;
storage.roles ??= true;

let unpatch;

export default {
    onLoad: async () => {
        const [isMuted, isEveryoneSupressed, isRolesSupressed] = [await UserGuildSettingsStore.isMuted(null), await UserGuildSettingsStore.isSuppressEveryoneEnabled(null), await UserGuildSettingsStore.isSuppressRolesEnabled(null)];
        if (isMuted || isEveryoneSupressed || isRolesSupressed) {
            updateGuildNotificationSettings(null, { "muted": false, "suppress_everyone": false, "suppress_roles": false });
        }
        
        // `after` (and the other patcher functions) return a function that removes the first patch
        unpatch = after("acceptInvite", invites, async (args, res) => {
            const guildId = await res.then(x => {
                return x.guild.id;
            });
            if (guildId === "@me" || guildId === "null" || guildId == null) return;
            updateGuildNotificationSettings(guildId, { "muted": storage.server, "suppress_everyone": storage.everyone, "suppress_roles": storage.roles });
        });
    },
    // `unpatch` is a function here so we can just directly pass it to onUnload
    onUnload: unpatch,
    settings: Settings
};
