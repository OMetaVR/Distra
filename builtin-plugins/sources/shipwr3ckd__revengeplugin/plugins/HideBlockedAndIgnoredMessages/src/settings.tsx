import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";

const { View, ScrollView } = ReactNative;

export default function Settings() {
    useProxy(storage);

    return (
        <ScrollView>
            <View>
                <Forms.FormSwitchRow
                    label="Remove blocked messages"
                    value={storage.blocked ?? true}
                    onValueChange={(v) => (storage.blocked = v)}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Remove ignored messages"
                    value={storage.ignored ?? true}
                    onValueChange={(v) => (storage.ignored = v)}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Remove replies to blocked/ignored users"
                    value={storage.removeReplies ?? true}
                    onValueChange={(v) => (storage.removeReplies = v)}
                    note="Filters messages replying to blocked or ignored users."
                />
            </View>
        </ScrollView>
    );
}