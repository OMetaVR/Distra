import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

// tag added to all print statements to help with debugging with logcat on adb
const TAG = "[custom-avatars]";

let patches = [];

export { default as settings } from "./settings";

export function onLoad(): void {
    console.log(`${TAG} loaded`);

    const TARGET_ID = storage.targetUserId;
    const OVERRIDE_URL = storage.imageUrl;

    const UserStore = findByStoreName("UserStore");
    if (!UserStore) {
        console.log(`${TAG} userStore not found`);
        return;
    }

    const avatarModule = findByProps("getUserAvatarURL");
    if (!avatarModule) {
        console.log(`${TAG} avatar module not found`);
        return;
    }



    // patch getUserAvatarSource, overrides avatar in DMs and group chats
    if (avatarModule.getUserAvatarSource) {
        const originalGetUserAvatarSource = avatarModule.getUserAvatarSource;
        avatarModule.getUserAvatarSource = function (...args) {
            const user = args[0];

            // only intercept target user
            if (user?.id === TARGET_ID) {
                const original = originalGetUserAvatarSource.apply(this, args);
                if (original) {
                    return {
                        ...original,
                        uri: OVERRIDE_URL
                    };
                }
            }
            // ignore everyone else
            return originalGetUserAvatarSource.apply(this, args);
        };
        patches.push(() => { avatarModule.getUserAvatarSource = originalGetUserAvatarSource; });
    }

    // patch getUserAvatarURL, overrides avatar in voice calls
    const originalGetUserAvatarURL = avatarModule.getUserAvatarURL;
    avatarModule.getUserAvatarURL = function (...args) {
        const user = args[0];
        // only intercept for target user
        if (user?.id === TARGET_ID) {
            return OVERRIDE_URL;
        }
        // ignore other users
        return originalGetUserAvatarURL.apply(this, args);
    };
    patches.push(() => { avatarModule.getUserAvatarURL = originalGetUserAvatarURL; });

    console.log(`${TAG} patches applied`);

    // refresh ui
    try {
        FluxDispatcher.dispatch({
            type: "USER_UPDATE",
            user: UserStore.getUser(TARGET_ID)
        });
        console.log(`${TAG} ui refreshed`);
    } catch (e) {
        console.log(`${TAG} could not trigger refresh:`, e.message);
    }
}

export function onUnload(): void {
    console.log(`${TAG} unloading...`);

    // restore patches
    patches.forEach(unpatch => unpatch());
    patches = [];

    console.log(`${TAG} unloaded`);
}