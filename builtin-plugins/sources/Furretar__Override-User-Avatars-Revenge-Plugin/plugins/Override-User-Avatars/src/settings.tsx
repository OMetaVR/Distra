import { ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const { FormDivider, FormIcon, FormInput, FormRow } = Forms;

export default () => {
    useProxy(storage);

    return (
        <ReactNative.ScrollView>
            <FormRow
                label="User ID"
            />
            <FormInput
                placeholder="Enter Target User ID"
                value={storage.targetUserId || ""}
                onChange={(v) => (storage.targetUserId = v)}
            />
            <FormDivider />
            <FormRow
                label="Image URL"
            />
            <FormInput
                placeholder="Enter image URL"
                value={storage.imageUrl || ""}
                onChange={(v) => (storage.imageUrl = v)}
            />
        </ReactNative.ScrollView>
    );
};