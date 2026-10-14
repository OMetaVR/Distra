/*!
 * https://github.com/amsyarasyiq/aliucordrn-plugins/blob/6c0be39ca673c6ebcf48c0f397246b76d578aa26/MoarConfirm/index.tsx
 *
 * Copyright (c) 2022 Amsyar Rasyiq
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { logger, patcher } from "@vendetta";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";

import Settings from "./Settings";

const dialog = findByProps("show", "confirm", "close");
const relationshipManager = findByProps("addRelationship");
const callManager = findByProps("handleStartCall");
const actionSheetManager = findByProps("hideActionSheet");
const UserStore = findByStoreName("UserStore");

// Distra: every confirmation can be switched off in the settings page (on by default, as before).
const enabled = (key: string) => (storage as Record<string, any>)[key] !== false;

// Accounts without a discriminator ("0") are shown by username only.
const tag = ({ username, discriminator }: { username: string; discriminator?: string }) =>
    discriminator && discriminator !== "0" ? `${username}#${discriminator}` : username;

export default new class MoreConfirm {
    patches = [] as (() => void)[];
    settings = Settings;

    onLoad() {
        this.patches.push(patcher.instead("handleStartCall", callManager, (args, orig) => {
            const [{ rawRecipients: [recipient, multiple] }, isVideo] = args;
            if (!enabled(isVideo ? "videoCalls" : "voiceCalls")) return orig(...args);

            const name = tag(recipient);
            const action = isVideo ? "video call" : "call";

            // if `multiple` is defined, it's probably a group call
            dialog.show({
                title: multiple ? `Start a group ${action}?` : `Start a ${action} with ${name}?`,
                body: multiple ? "Are you sure you want to start the group call?" : `Are you sure you want to ${action} ${name}?`,
                confirmText: "Yes",
                cancelText: "Cancel",
                confirmColor: "brand",
                onConfirm: () => {
                    try {
                        orig(...args);
                    } catch (e) {
                        logger.error("Failed to start call", e);
                    }
                },
            });
        }));

        this.patches.push(patcher.instead("addRelationship", relationshipManager, (args, orig) => {
            if (typeof args[0] !== "object" || !args[0].userId) return orig.apply(this, args);
            const block = args[0].type === 2;
            if (!enabled(block ? "block" : "addFriend")) return orig.apply(this, args);

            const user = UserStore.getUser(args[0].userId);
            if (!user) return orig.apply(this, args);
            const name = tag(user);

            // This is hacky, but it *works*
            const hideASInterval = setInterval(() => actionSheetManager.hideActionSheet(), 100);
            setTimeout(() => clearInterval(hideASInterval), 3000);

            return new Promise(r => {
                dialog.show({
                    title: `${block ? "Block" : "Friend"} ${name}?`,
                    body: `Are you sure you want to ${block ? "block" : "friend"} ${name}?`,
                    confirmText: "Yes",
                    cancelText: "Cancel",
                    confirmColor: "brand",
                    onConfirm: () => {
                        try {
                            r(orig.apply(this, args));
                        } catch (e) {
                            logger.error("Failed to add relationship", e);
                        } finally {
                            clearInterval(hideASInterval);
                        }
                    },
                    onCancel: () => void clearInterval(hideASInterval)
                });
            });
        }));
    }

    onUnload() {
        for (const unpatch of this.patches) unpatch();
    }
};
