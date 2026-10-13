// Alerts. Discordia's own UI uses the system alert (React Native's Alert),
// which is always available and cannot break with Discord updates. The
// Discord-styled variants exist for plugins that expect Vendetta's API.

import { Alert } from "react-native";

import { findByPropsLazy } from "@/metro";

export function confirm({ title, message, confirmText = "OK", cancelText = "Cancel", destructive = false }: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
}): Promise<boolean> {
    return new Promise(resolve => {
        Alert.alert(title, message, [
            { text: cancelText, style: "cancel", onPress: () => resolve(false) },
            { text: confirmText, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
    });
}

export function prompt({ title, message, defaultValue = "", confirmText = "OK" }: {
    title: string;
    message?: string;
    defaultValue?: string;
    confirmText?: string;
}): Promise<string | null> {
    return new Promise(resolve => {
        Alert.prompt(title, message, [
            { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
            { text: confirmText, onPress: (value?: string) => resolve(value ?? "") },
        ], "plain-text", defaultValue);
    });
}

const Alerts = findByPropsLazy("openLazy", "close");

export interface ConfirmationAlertOptions {
    title?: string;
    content: unknown;
    confirmText?: string;
    confirmColor?: string;
    onConfirm: () => void;
    cancelText?: string;
    onCancel?: () => void;
    isDismissable?: boolean;
}

/** Discord-styled confirmation alert (Vendetta's `showConfirmationAlert`). */
export function showConfirmationAlert({ content, isDismissable = true, ...options }: ConfirmationAlertOptions) {
    return Alerts.show({ ...options, body: content, isDismissable });
}

export interface InputAlertOptions {
    title?: string;
    confirmText?: string;
    onConfirm: (value: string) => void | Promise<void>;
    cancelText?: string;
    placeholder?: string;
    initialValue?: string;
    secureTextEntry?: boolean;
}

/** Vendetta's `showInputAlert`, backed by the system prompt. */
export function showInputAlert({ title = "", confirmText = "OK", cancelText = "Cancel", onConfirm, initialValue = "", secureTextEntry }: InputAlertOptions) {
    Alert.prompt(title, undefined, [
        { text: cancelText, style: "cancel" },
        { text: confirmText, onPress: (value?: string) => void Promise.resolve(onConfirm(value ?? "")).catch(e => Alert.alert("Error", String(e))) },
    ], secureTextEntry ? "secure-text" : "plain-text", initialValue);
}
