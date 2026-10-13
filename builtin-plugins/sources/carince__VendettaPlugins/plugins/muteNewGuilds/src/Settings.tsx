import { ReactNative as RN } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";

const { FormSwitchRow } = Forms;

export default () => {
    useProxy(storage);

    return (
        <RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }}>
            <FormSwitchRow
                label="Suppress Guild"
                value={storage["server"]}
                onValueChange={(v: boolean) => storage["server"] = v}
            />
            <FormSwitchRow
                label="Suppress @everyone and @here"
                value={storage["everyone"]}
                onValueChange={(v: boolean) => storage["everyone"] = v}
            />
            <FormSwitchRow
                label="Suppress All Role @mentions"
                value={storage["roles"]}
                onValueChange={(v: boolean) => storage["roles"] = v}
            />
        </RN.ScrollView>
    );
};
