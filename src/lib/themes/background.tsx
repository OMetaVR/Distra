// A theme's background image behind the message list. The list's own background is made
// translucent by the theme's opacity so the image shows through.

import { ImageBackground, StyleSheet } from "react-native";

import { logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { findInReactTree } from "@/lib/utils";
import { findByFilePath } from "@/metro";

import { withOpacity } from "./color";
import { getAppliedTheme } from "./engine";

let patched = false;
let hidden = false;

export const setBackgroundHidden = (value: boolean) => void (hidden = value);

function activeBackground() {
    const background = getAppliedTheme()?.definition.background;
    if (hidden || !background?.url || (background.blur != null && typeof background.blur !== "number")) return null;
    return background;
}

export function patchChatBackground() {
    if (patched) return;
    const Messages = findByFilePath("modules/messages/native/Messages.tsx", true);
    if (!Messages?.render && !Messages?.type?.render) {
        logger.warn("Theme backgrounds unavailable: message list component not found");
        return;
    }
    patched = true;
    const target = Messages.render ? Messages : Messages.type;

    corePatcher.after("render", target, (_, ret) => {
        const background = activeBackground();
        if (!background) return;

        const list = findInReactTree(ret, (node: any) => node?.props && "HACK_fixModalInteraction" in node.props && node.props.style);
        if (list) {
            const flat = StyleSheet.flatten(list.props.style) ?? {};
            const color = typeof flat.backgroundColor === "string" ? flat.backgroundColor : "#000000";
            list.props.style = [list.props.style, { backgroundColor: withOpacity(color, 1 - (background.opacity ?? 1)) }];
        }

        return (
            <ImageBackground style={{ flex: 1, height: "100%" }} source={{ uri: background.url }} blurRadius={background.blur}>
                {ret}
            </ImageBackground>
        );
    });
}
