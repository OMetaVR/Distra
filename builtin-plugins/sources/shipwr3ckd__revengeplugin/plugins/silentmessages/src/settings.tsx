import { React, stylesheet, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { showToast } from "@vendetta/ui/toasts";

const { useState } = React;
const {
  FormRow,
  FormSwitchRow,
  FormSection,
  FormDivider,
  FormInput,
  FormIcon,
} = Forms;

const { TouchableOpacity } = ReactNative;

const styles = stylesheet.createThemedStyleSheet({
  input: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
});

function isDiscordId(id: string): boolean {
  return /^\d{17,19}$/.test(id);
}

export default function SilentSettings() {
  useProxy(storage);
  const [input, setInput] = useState("");

  storage.silentList ??= [];
  storage.alwaysSilent ??= false;

  const addUserId = () => {
    const clean = input.trim();
    if (!isDiscordId(clean)) {
      showToast("Invalid User ID!", getAssetIDByName("server-error"));
      return;
    }
    if (!storage.silentList.includes(clean)) {
      storage.silentList = [...storage.silentList, clean];
      setInput("");
    } else {
      showToast("User ID already in the list");
    }
  };

  const removeUserId = (id: string) => {
    storage.silentList = storage.silentList.filter((x) => x !== id);
  };

  return (
    <>
      <FormSwitchRow
        label="Always send silently"
        subLabel="All of your messages will be sent silently."
        leading={<FormIcon source={getAssetIDByName("ic_noise_cancellation_disabled")} />}
        value={!!storage.alwaysSilent}
        onValueChange={(v) => (storage.alwaysSilent = v)}
      />

      <FormDivider />

        <FormInput
          title="Add User ID"
          placeholder="123456789012345678"
          value={input}
          keyboardType="numeric"
          onChangeText={(text) => setInput(text.replace(/[^0-9]/g, ""))}
          onSubmitEditing={addUserId}
          style={styles.input}
        />
        
      <FormSection title="Silenced User/Channel IDs">

        {storage.silentList.map((id) => (
          <FormRow
            key={id}
            label={id}
            trailing={
              <TouchableOpacity onPress={() => removeUserId(id)}>
                <FormIcon source={getAssetIDByName("ic_trash_24px")} />
              </TouchableOpacity>
            }
          />
        ))}
      </FormSection>
    </>
  );
}