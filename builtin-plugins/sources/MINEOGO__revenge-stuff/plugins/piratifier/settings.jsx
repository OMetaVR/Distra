import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";
import { showConfirmationAlert } from "@vendetta/ui/alerts";

const { FormSwitchRow, FormSection, FormText } = Forms;

export default function Settings() {
    useProxy(storage);
    storage.settings ??= {};

    function handleOnDeviceToggle(val) {
        if (val) {
            storage.settings.on_device = true;
            return;
        }

        showConfirmationAlert({
            title: "⚠️ External API Warning",
            content:
                "Switching to API translation means your messages will be sent to pirate.monkeyness.com before being delivered.\n\n" +
                "This API is NOT owned by Revenge or the plugin author. By enabling this, you acknowledge that your messages will be processed by a third-party server.\n\n" +
                "You are solely responsible for what you send.",
            confirmText: "I Understand, Enable",
            confirmColor: "brand",
            cancelText: "Keep On-Device",
            onConfirm: () => {
                storage.settings.on_device = false;
            },
            onCancel: () => {
                // Force a storage re-render to toggle the switch back to checked if cancelled
                storage.settings.on_device = true;
            },
        });
    }

    return (
        <ReactNative.ScrollView style={{ flex: 1 }}>
            <FormSection title="Translation">
                <FormSwitchRow
                    label="On-Device Translation"
                    subLabel="Use local on-device piratification instead of the monkeyness.com API. Faster & works offline, but less accurate. Disabling this will send your messages to an external server."
                    value={!!storage.settings.on_device}
                    onValueChange={handleOnDeviceToggle}
                />
            </FormSection>
            <FormSection title="Info">
                <FormText style={{ paddingHorizontal: 16, paddingVertical: 8, opacity: 0.6 }}>
                    {"All messages you send are automatically piratified.\n\nUse /piratify <message> [on-device: true/false] to send a one-off piratified message with an optional override for the translation method."}
                </FormText>
            </FormSection>
        </ReactNative.ScrollView>
    );
}
