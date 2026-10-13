// Hide Chat Buttons: hides chat bar buttons you don't use (gift, app launcher, voice
// message, thread) and call buttons (profiles, DM header, voice panel camera). Rebuilt from
// SerStars' HideChatButtons (+ ssense's HideGiftButton) for the current chat input, which takes
// these as props, and janisslsm's HideCallButtons for the current call buttons, which are found
// by their PhoneCallIcon / VideoIcon.

import { ScrollView } from "react-native";

import { createFileStorage, useProxy } from "@/core/storage";
import { afterComponentRender, findElement, forEachElement } from "@/lib/components";
import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath, findByProps } from "@/metro";
import { Stack, TableRow, TableRowGroup, TableSwitchRow } from "@/ui/components";

import { definePlugin } from "../types";

const CHAT_INPUT = "modules/chat_input/native/ChatInput.tsx";
const PROFILE_CONTACT_BUTTONS = "modules/user_profile/native/UserProfileContactButtons.tsx";
const DM_HEADER_BUTTONS = "modules/main_tabs_v2/native/channel/header/PrivateChannelButtons.tsx";
const VOICE_PANEL_VIDEO_BUTTON = "modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx";
const logger = new Logger("HideChatButtons");

const defaults = {
    gift: true, appLauncher: true, voiceMessage: false, thread: false,
    profileVoice: false, profileVideo: false, dmVoice: false, dmVideo: false, voicePanelVideo: false,
};
let settings = { ...defaults };
let patcher = createPatcher("HideChatButtons");
const patchedClasses = new WeakSet<object>();

/** Rewrites the chat input's button flags wherever they appear in a rendered tree. */
function hideButtons(element: any) {
    forEachElement(element, node => {
        const props = node.props;
        if (!props || typeof props !== "object") return;
        if (settings.gift) {
            if ("shouldShowGiftButton" in props) props.shouldShowGiftButton = false;
            if ("hideGiftButton" in props) props.hideGiftButton = true;
        }
        if (settings.appLauncher && "isAppLauncherEnabled" in props) props.isAppLauncherEnabled = false;
        if (settings.voiceMessage && "canSendVoiceMessage" in props) props.canSendVoiceMessage = false;
        if (settings.thread) {
            if ("canStartThreads" in props) props.canStartThreads = false;
            if ("canCreateThreads" in props) props.canCreateThreads = false;
        }

        // The chat input is a class component rendered by a wrapper; hook its render too.
        const type = node.type;
        if (typeof type === "function" && typeof type.prototype?.render === "function" && !patchedClasses.has(type)) {
            patchedClasses.add(type);
            patcher.after("render", type.prototype, (_args: any[], rendered: any) => void hideButtons(rendered));
        }
    });
}

const icon = (name: string) =>
    findByFilePath(`design/components/Icon/native/redesign/generated/${name}.tsx`)?.[name] ?? findByProps(name)?.[name];

/** Nulls out every child in `tree` (not `tree` itself) for which `remove` is true. */
function pruneChildren(tree: any, remove: (node: any) => boolean) {
    forEachElement(tree, node => {
        const children = node.props?.children;
        if (Array.isArray(children)) {
            children.forEach((child, i) => {
                if (child && typeof child === "object" && remove(child)) children[i] = null;
            });
        } else if (children && typeof children === "object" && !Array.isArray(children) && remove(children)) {
            node.props.children = null;
        }
    });
}

/** Removes buttons showing one of `icons`: profile buttons take the icon as a prop, header buttons as a child. */
function hideIconButtons(tree: any, icons: unknown[]) {
    const isIcon = (node: any) => node != null && icons.includes(node.type);
    pruneChildren(tree, node =>
        isIcon(node.props?.icon)
        || (typeof node.props?.onPress === "function" && findElement(node.props.children, isIcon) != null));
}

function patchCallButtons() {
    const PhoneCallIcon = icon("PhoneCallIcon");
    const VideoIcon = icon("VideoIcon");
    if (!PhoneCallIcon || !VideoIcon) logger.warn("Call icons not found");

    const selected = (voice: boolean, video: boolean) => [voice && PhoneCallIcon, video && VideoIcon].filter(Boolean);
    const patched = [
        afterComponentRender(patcher, PROFILE_CONTACT_BUTTONS, (_props, element) => {
            const icons = selected(settings.profileVoice, settings.profileVideo);
            if (icons.length) hideIconButtons(element, icons);
        }),
        afterComponentRender(patcher, DM_HEADER_BUTTONS, (_props, element) => {
            const icons = selected(settings.dmVoice, settings.dmVideo);
            if (icons.length) hideIconButtons(element, icons);
        }),
        afterComponentRender(patcher, VOICE_PANEL_VIDEO_BUTTON, (_props, element) => settings.voicePanelVideo ? null : element),
    ];
    if (patched.includes(false)) logger.warn(`Some call button components were not found (${patched.join(", ")})`);
}

function SettingsPage() {
    useProxy(settings);
    const Switch = ({ label, field, icon }: { label: string; field: keyof typeof defaults; icon: string }) => (
        <TableSwitchRow label={label} icon={<TableRow.Icon source={findAssetId(icon)} />} value={settings[field]} onValueChange={(value: boolean) => void (settings[field] = value)} />
    );
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Hide">
                    <Switch label="Gift button" field="gift" icon="GiftIcon" />
                    <Switch label="App launcher" field="appLauncher" icon="AppsIcon" />
                    <Switch label="Voice message button" field="voiceMessage" icon="MicrophoneIcon" />
                    <Switch label="Thread button" field="thread" icon="ThreadIcon" />
                </TableRowGroup>
                <TableRowGroup title="Calls">
                    <Switch label="Voice call on profiles" field="profileVoice" icon="PhoneCallIcon" />
                    <Switch label="Video call on profiles" field="profileVideo" icon="VideoIcon" />
                    <Switch label="Voice call in DM header" field="dmVoice" icon="PhoneCallIcon" />
                    <Switch label="Video call in DM header" field="dmVideo" icon="VideoIcon" />
                    <Switch label="Camera button in voice panel" field="voicePanelVideo" icon="VideoIcon" />
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}

export default definePlugin({
    id: "discordia:hide-chat-buttons",
    manifest: {
        name: "Hide Chat Buttons",
        description: "Hides buttons you don't use: gift, app launcher, voice messages and threads in the chat bar, and call buttons on profiles, in DMs and in voice channels.",
        authors: [{ name: "Discordia" }, { name: "SerStars (HideChatButtons)" }, { name: "ssense (HideGiftButton)" }, { name: "janisslsm (HideCallButtons)" }],
        version: "1.1.0",
    },
    async start() {
        settings = await createFileStorage("plugins/data/core-hidechatbuttons.json", defaults);
        patcher = createPatcher("HideChatButtons");
        if (!afterComponentRender(patcher, CHAT_INPUT, (_props, element) => void hideButtons(element))) {
            logger.warn("Chat input component not found");
        }
        patchCallButtons();
    },
    stop() {
        patcher.unpatchAll();
    },
    SettingsComponent: SettingsPage,
});
