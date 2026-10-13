import { React, ReactNative, stylesheet } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const { useState } = React;
const { TextInput } = ReactNative;
const { FormRow, FormSwitchRow, FormSection, FormDivider, FormInput } = Forms;

export default function SilentDeleteSettings() {
    useProxy(storage);

    // Initialize defaults if not set
    storage.replacementText ??= "** **";
    storage.deleteDelay ??= 200;
    storage.suppressNotifications ??= true;
    storage.deleteOriginal ??= true;
    storage.purgeInterval ??= 500;

    return (
        <>
            <FormSection title="Behavior">
                <FormInput
                    title="Replacement Text"
                    placeholder="** **"
                    value={storage.replacementText}
                    onChangeText={(v: string) => (storage.replacementText = v)}
                />
                <FormDivider />
                <FormSwitchRow
                    label="Suppress Notifications"
                    subLabel="Prevents pinging mentioned users when replacing the message."
                    value={!!storage.suppressNotifications}
                    onValueChange={(v: boolean) => (storage.suppressNotifications = v)}
                />
                <FormDivider />
                <FormSwitchRow
                    label="Delete Original Message"
                    subLabel="If disabled, the original message will reappear on client restart."
                    value={!!storage.deleteOriginal}
                    onValueChange={(v: boolean) => (storage.deleteOriginal = v)}
                />
            </FormSection>

            <FormSection title="Timing (milliseconds)">
                <FormInput
                    title="Delete Delay"
                    placeholder="200"
                    value={String(storage.deleteDelay ?? 200)}
                    keyboardType="numeric"
                    onChangeText={(v: string) => {
                        const n = parseInt(v);
                        if (!isNaN(n)) storage.deleteDelay = n;
                    }}
                />
                <FormDivider />
                <FormInput
                    title="Purge Interval"
                    placeholder="500"
                    value={String(storage.purgeInterval ?? 500)}
                    keyboardType="numeric"
                    onChangeText={(v: string) => {
                        const n = parseInt(v);
                        if (!isNaN(n)) storage.purgeInterval = n;
                    }}
                />
            </FormSection>
        </>
    );
}
