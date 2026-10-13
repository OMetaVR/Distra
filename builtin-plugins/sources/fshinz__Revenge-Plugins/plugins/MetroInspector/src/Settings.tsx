import { metro } from "@vendetta";
import { openMetroExplorer } from "./index";

// Safely pull React from Metro or window
const React = (window as any).React || metro.findByProps("createElement", "useState");

// Find UI components dynamically from Metro memory
const FormSection = metro.find((m) => m?.type?.name === "FormSection") || metro.findByProps("FormSection")?.FormSection;
const FormText = metro.find((m) => m?.type?.name === "FormText") || metro.findByProps("FormText")?.FormText;
const FormButton = metro.find((m) => m?.type?.name === "FormButton") || metro.findByProps("FormButton")?.FormButton;

// Fallback primitives if Revenge UI components are not available
const { View, Text, TouchableOpacity } = metro.findByProps("View", "Text", "TouchableOpacity") || {};

export default function Settings(): React.JSX.Element {
  // Option A: Use Metro Form components if found
  if (FormSection && FormButton) {
    return (
      <FormSection title="Metro Explorer Controls">
        {FormText ? (
          <FormText style={{ marginBottom: 12, color: "#949BA4" }}>
            Launch the interactive Metro inspector bottom sheet to search and inspect active memory modules.
          </FormText>
        ) : null}
        <FormButton label="Open Metro Explorer" onPress={() => openMetroExplorer()} />
      </FormSection>
    );
  }

  // Option B: Pure React Native fallback (guaranteed not to crash)
  return (
    <View style={{ padding: 16, backgroundColor: "#1e1f22", borderRadius: 8 }}>
      <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
        Metro Explorer Controls
      </Text>
      <Text style={{ color: "#949BA4", fontSize: 13, marginBottom: 14 }}>
        Launch the interactive Metro inspector bottom sheet to search and inspect active memory modules.
      </Text>
      <TouchableOpacity
        style={{ backgroundColor: "#5865F2", padding: 12, borderRadius: 8, alignItems: "center" }}
        onPress={() => openMetroExplorer()}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "bold" }}>Open Metro Explorer</Text>
      </TouchableOpacity>
    </View>
  );
}
