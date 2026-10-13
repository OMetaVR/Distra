import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import RPInstance from ".";
import { logger } from "@vendetta";

const { View, ScrollView, TouchableOpacity } = ReactNative;
const {
  FormText,
  FormInput,
  FormRow,
  FormSwitchRow,
  FormSection
} = Forms;

const typedStorage = storage as typeof storage & {
  selected: string;
  selections: Record<string, Activity>;
};

export default function Settings() {
  useProxy(typedStorage);

  if (!typedStorage.selected || !typedStorage.selections?.[typedStorage.selected]) {
    logger.warn("[RPC] Resetting invalid profile");
    typedStorage.selected = "default";
    typedStorage.selections ??= {};
    typedStorage.selections.default ??= {
      name: "Discord",
      application_id: "1054951789318909972",
      flags: 0,
      type: 0,
      timestamps: { _enabled: false, start: Date.now() },
      assets: {},
      buttons: [{}, {}]
    };
  }

  const settings = useProxy(typedStorage.selections[typedStorage.selected]) as Activity;

  return (
    <ScrollView style={{ paddingBottom: 24 }}>
      <View style={{ padding: 16 }}>
        <FormText style={{ marginBottom: 12 }}>
          Configure your custom RPC below.
        </FormText>

        <TouchableOpacity
          style={{
            backgroundColor: "#5865F2",
            padding: 12,
            borderRadius: 8,
            alignItems: "center",
            marginBottom: 16
          }}
          onPress={() => {
            logger.log("[RPC] Manual update");
            RPInstance.onUnload();
            RPInstance.onLoad();
          }}
        >
          <FormText style={{ color: "white" }}>Update Presence</FormText>
        </TouchableOpacity>
        <FormSection title="Basic">
          <FormInput
            title="Application Name"
            placeholder="Discord"
            value={settings.name}
            onChange={(v) => settings.name = v}
          />
          <FormInput
            title="Application ID"
            placeholder="1054951789318909972"
            value={settings.application_id}
            onChange={(v) => settings.application_id = v}
            keyboardType="numeric"
            helpText="Geeked out stuff but you can use your own bot's application ID"
          />
          <FormInput
            title="Activity Type (0-5)"
            placeholder="0"
            value={String(settings.type ?? 0)}
            onChange={(v) => settings.type = Number(v)}
            keyboardType="numeric"
            helpText="Playing, Streaming, Listening, Watching, Custom, Competing"
          />
          <FormInput
            title="Details"
            placeholder="Competitive"
            value={settings.details}
            onChange={(v) => settings.details = v}
          />
          <FormInput
            title="State"
            placeholder="Playing Solo"
            value={settings.state}
            onChange={(v) => settings.state = v}
          />
        </FormSection>
        <FormSection title="Images">
          <FormInput
            title="Large Image"
            placeholder="asset_key or URL"
            value={settings.assets?.large_image}
            onChange={(v) => settings.assets.large_image = v}
          />
          <FormInput
            title="Large Image Text"
            placeholder="Displayed on hover"
            value={settings.assets?.large_text}
            disabled={!settings.assets?.large_image}
            onChange={(v) => settings.assets.large_text = v}
          />
          <FormInput
            title="Small Image"
            placeholder="asset_key or URL"
            value={settings.assets?.small_image}
            onChange={(v) => settings.assets.small_image = v}
          />
          <FormInput
            title="Small Image Text"
            placeholder="Displayed on hover"
            value={settings.assets?.small_text}
            disabled={!settings.assets?.small_image}
            onChange={(v) => settings.assets.small_text = v}
          />
          <FormText style={{ marginLeft: 16, marginTop: 4 }}>
            Image keys can be Discord app asset names or direct URLs.
          </FormText>
        </FormSection>
        <FormSection title="Timestamps">
          <FormSwitchRow
            label="Enable timestamps"
            value={settings.timestamps._enabled}
            onValueChange={(v) => settings.timestamps._enabled = v}
          />
          <FormInput
            title="Start (ms)"
            placeholder="e.g. 1680000000000"
            value={String(settings.timestamps?.start ?? "")}
            disabled={!settings.timestamps._enabled}
            onChange={(v) => settings.timestamps.start = Number(v)}
            keyboardType="numeric"
          />
          <FormInput
            title="End (ms)"
            placeholder="optional"
            value={String(settings.timestamps?.end ?? "")}
            disabled={!settings.timestamps._enabled}
            onChange={(v) => settings.timestamps.end = Number(v)}
            keyboardType="numeric"
          />
          <FormRow
            label="Use current time"
            subLabel="Set now as start timestamp"
            disabled={!settings.timestamps._enabled}
            trailing={FormRow.Arrow}
            onPress={() => settings.timestamps.start = Date.now()}
          />
        </FormSection>
        <FormSection title="Buttons">
          <FormInput
            title="Button 1 Label"
            placeholder="Label"
            value={settings.buttons?.[0]?.label}
            onChange={(v) => settings.buttons[0].label = v}
          />
          <FormInput
            title="Button 1 URL"
            placeholder="https://example.com"
            value={settings.buttons?.[0]?.url}
            disabled={!settings.buttons?.[0]?.label}
            onChange={(v) => settings.buttons[0].url = v}
            helpText={
              settings.buttons?.[0]?.label && !settings.buttons?.[0]?.url ? (
                <ReactNative.Text style={{ color: "red" }}>Required if button label is set</ReactNative.Text>
              ) : undefined
            }
          />
          <FormInput
            title="Button 2 Label"
            placeholder="Label"
            value={settings.buttons?.[1]?.label}
            onChange={(v) => settings.buttons[1].label = v}
          />
          <FormInput
            title="Button 2 URL"
            placeholder="https://example.com"
            value={settings.buttons?.[1]?.url}
            disabled={!settings.buttons?.[1]?.label}
            onChange={(v) => settings.buttons[1].url = v}
            helpText={
              settings.buttons?.[1]?.label && !settings.buttons?.[1]?.url ? (
                <ReactNative.Text style={{ color: "red" }}>Required if button label is set</ReactNative.Text>
              ) : undefined
            }
          />
        </FormSection>
      </View>
    </ScrollView>
  );
}