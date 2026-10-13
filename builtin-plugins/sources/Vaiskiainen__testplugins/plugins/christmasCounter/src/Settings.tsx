import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { Forms as UiForms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";

const { Pressable, ScrollView, View, Text } = ReactNative;

const Forms = UiForms || findByProps(
  "FormSection",
  "FormRow",
  "FormSwitchRow",
  "FormText",
  "FormTitle"
) || {};

const { FormSection, FormRow, FormSwitchRow, FormText } = Forms;
const ThemedText = FormText ?? Text;

const getDaysToChristmas = (targetDay: number) => {
  const now = new Date();
  let christmas = new Date(now.getFullYear(), 11, targetDay);
  if (now > christmas) christmas.setFullYear(now.getFullYear() + 1);
  return Math.floor((christmas.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

export default function Settings() {
  const [countOn25th, setCountOn25th] = React.useState(
    storage.countOn25th ?? false
  );
  const targetDay = countOn25th ? 25 : 24;
  const targetLabel = countOn25th ? "Christmas Day" : "Christmas Eve";
  const days = getDaysToChristmas(targetDay);


  if (!FormSection || !FormRow || !FormSwitchRow) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "600", textAlign: "center" }}>
          Failed to load native settings UI
        </Text>
        <Text style={{ marginTop: 6, fontSize: 15, textAlign: "center" }}>
          Falling back to basic view. {days} days until Christmas Eve! 🎄🎁
        </Text>
        <Text style={{ marginTop: 16, fontSize: 13, textAlign: "center" }}>
          Check console for missing components or update your Revenge/Vendetta version.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      <FormSection title="Christmas Counter" titleStyle={{ fontWeight: "bold" }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <ThemedText style={{ fontSize: 22, fontWeight: "700" }}>
            {days} days until {targetLabel}! 🎄🎁
          </ThemedText>
        </View>
        <FormSwitchRow
          label="Count down to Dec 25"
          subLabel="Turn off to count down to Dec 24"
          value={countOn25th}
          onValueChange={(value: boolean) => {
            setCountOn25th(value);
            storage.countOn25th = value;
          }}
        />
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Pressable
            onPress={() => {
              const daysNow = getDaysToChristmas(targetDay);
              showToast(`Only ${daysNow} days until ${targetLabel}! 🎁`);
            }}
            style={({ pressed }) => [
              {
                alignItems: "center",
                backgroundColor: pressed ? "#3b6fe0" : "#4c82ff",
                borderRadius: 8,
                paddingVertical: 10,
              },
            ]}
          >
            <ThemedText style={{ fontSize: 16, fontWeight: "600", color: "white" }}>
              Test Notification
            </ThemedText>
          </Pressable>
        </View>
      </FormSection>

      <FormSection title="About">
        <FormRow label="Created by: Vaiskiainen" />
      </FormSection>
    </ScrollView>
  );
}
