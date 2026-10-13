import { assets, implementPlugin, patcher, settings } from "@lib";
import { Text } from "@lib/components/discord";
import { createThemedStyleSheet, ThemeColorMap, ErrorBoundary, getStore, useStateFromStores } from "@lib/util";
import { FormRow, FormSection, FormSwitch } from "@lib/components/form";

import { getByName } from "enmity/metro";
import { Image, View } from "enmity/components";
import { Locale } from "enmity/metro/common";

import { isValidElement } from "react";

const RelationshipStore = getStore("RelationshipStore");

function getCreatedAt(value: Date | string | number, lang?: string) {
  if (null == value || "" === value) return null;
  const data = new Date(value);
  return !(data instanceof Date) || isNaN(data.getTime()) ? null : data.toLocaleDateString(lang, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

const styles = createThemedStyleSheet({
  header: {
    marginBottom: 8
  },
  text: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 6
  },
  icon: {
    height: 16,
    width: 16,
    tintColor: ThemeColorMap.INTERACTIVE_NORMAL
  }
});

// Discordia: Discord replaced the simplified profile card with UserProfileAboutMeCard (same userId prop).
const SimplifiedUserProfileAboutMeCard = getByName("UserProfileAboutMeCard", { default: false }) ?? getByName("SimplifiedUserProfileAboutMeCard", { default: false });

const ic_friend_wave_24px = assets.getIDByName("ic_friend_wave_24px");

const FriendsSinceSection = ErrorBoundary.wrap(function({ userId }: { userId: string }) {
  const since = useStateFromStores([ RelationshipStore ], () => {
    const since = RelationshipStore.getSince(userId);

    if (since && RelationshipStore.isFriend(userId)) return getCreatedAt(since, (Locale as unknown as { getLocale(): string }).getLocale());
    return null;
  });
  
  if (!since) return;
  
  return (
    <View>
      <Text color="header-secondary" style={styles.header} variant="text-sm/semibold">
        Friends Since
      </Text>
      <View style={styles.text}>
        {settings.getBoolean("add-icon", true) && (
          <Image source={ic_friend_wave_24px} style={styles.icon} />
        )}
        <Text>
          {since}
        </Text>
      </View>
    </View>
  )
});

implementPlugin({
  onStart() {    
    patcher.after(SimplifiedUserProfileAboutMeCard, "default", (self, [{ userId }], res) => {
      const children: React.ReactNode[] = res.props.children;
      
      let index = children.findIndex((value) => isValidElement(value) && typeof value.type === "function" && value.type.name === "MemberJoinDates");      
      
      // if index is `-1` just push to end
      if (!~index) index = children.length;

      children.splice(index + 1, 0, <FriendsSinceSection userId={userId} />);
    });
  },
  SettingsPanel() {
    return (
      <FormSection title="Settings">
        <FormRow
          label="Add Icon"
          trailing={
            <FormSwitch 
              value={settings.getBoolean("add-icon", true)} 
              onValueChange={(value) => settings.set("add-icon", value)} 
            />
          }
        />
      </FormSection>
    )
  }
});
