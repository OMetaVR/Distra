// Buttons in the chat bar (next to the + and app buttons). Plugins register one with
// `distra.chatBar.register({...})`; it follows the channel the bar belongs to.

import { useEffect, useReducer } from "react";
import { Image, Pressable, View } from "react-native";

import { afterComponentRender } from "@/lib/components";
import { findAssetId } from "@/lib/assets";
import { logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { semanticColors, resolveSemanticColor } from "@/ui/color";

const CHAT_INPUT_ACTIONS = "modules/chat_input/native/action_buttons/ChatInputActions.tsx";

export interface ChatBarButton {
    id: string;
    /** An asset name or id. */
    icon: string | number;
    label: string;
    onPress(channel: any): void;
    onLongPress?(channel: any): void;
    /** Draws a red slash across the icon, e.g. for "this is switched off". */
    slashed?(channel: any): boolean;
    /** Hide the button in some channels. */
    visible?(channel: any): boolean;
}

const buttons = new Map<string, ChatBarButton>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

/** Adds a button. Returns a function that removes it. Call `update()` after state it reads changes. */
export function registerChatBarButton(button: ChatBarButton) {
    buttons.set(button.id, button);
    notify();
    return () => {
        buttons.delete(button.id);
        notify();
    };
}

export const updateChatBar = notify;

function BarButton({ button, channel }: { button: ChatBarButton; channel: any }) {
    const source = typeof button.icon === "string" ? findAssetId(button.icon) : button.icon;
    const tint = resolveSemanticColor(semanticColors.INTERACTIVE_NORMAL);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={button.label}
            hitSlop={6}
            onPress={() => button.onPress(channel)}
            onLongPress={button.onLongPress ? () => button.onLongPress!(channel) : undefined}
            style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center" }}
        >
            <Image source={source} style={{ width: 24, height: 24, tintColor: tint }} />
            {button.slashed?.(channel) && (
                <View
                    pointerEvents="none"
                    style={{ position: "absolute", width: 28, height: 2.5, borderRadius: 2, backgroundColor: resolveSemanticColor(semanticColors.STATUS_DANGER) ?? "#ed4245", transform: [{ rotate: "-45deg" }] }}
                />
            )}
        </Pressable>
    );
}

function ChatBarRow({ channel, children }: { channel: any; children: any }) {
    const [, rerender] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(rerender);
        return () => void listeners.delete(rerender);
    }, []);
    const shown = [...buttons.values()].filter(button => button.visible?.(channel) !== false);
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {children}
            {shown.map(button => <BarButton key={button.id} button={button} channel={channel} />)}
        </View>
    );
}

export function installChatBar() {
    const patched = afterComponentRender(corePatcher, CHAT_INPUT_ACTIONS, (props, element) =>
        <ChatBarRow channel={props.channel}>{element}</ChatBarRow>);
    if (!patched) logger.warn("Chat bar actions not found; chat bar buttons won't show");
}
