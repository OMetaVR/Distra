/*
Thanks to kmmiio99o who I stole this code from :D
*/

import { storage } from "@vendetta/plugin";
import { React, ReactNative as RN, stylesheet } from "@vendetta/metro/common";
import { semanticColors } from "@vendetta/ui";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { findByProps } from "@vendetta/metro";
import i18n from "../i18n";

export default function Header() {
  const [clickCounter, setClickCounter] = React.useState(0);
  const [clickTimeout, setClickTimeout] = React.useState<NodeJS.Timeout | null>(
    null,
  );
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [isAnimatedAvatar, setIsAnimatedAvatar] = React.useState(false);

  // Get current user from Discord's user store
  const users = findByProps("getUser", "getCurrentUser");
  const currentUser = users?.getCurrentUser?.();

  // Get avatar URL utility
  const { getUserAvatarURL } = findByProps("getUserAvatarURL") || {};
  const { getDefaultAvatarURL } = findByProps("getDefaultAvatarURL") || {};

  const styles = stylesheet.createThemedStyleSheet({
    container: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 24,
      paddingHorizontal: 16,
      width: "100%",
      justifyContent: "center",
    },
    leftSection: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 20,
      maxWidth: 500,
    },
    avatarContainer: {
      position: "relative",
      width: 96,
      height: 96,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarWrapper: {
      width: 96,
      height: 96,
      borderRadius: 24,
      backgroundColor: semanticColors.BACKGROUND_SECONDARY,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
      borderWidth: 2,
      borderColor: semanticColors.BACKGROUND_TERTIARY,
    },
    avatar: {
      width: 92,
      height: 92,
      borderRadius: 22,
    },
    textContainer: {
      flex: 1,
      marginLeft: 4,
      justifyContent: "center",
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: semanticColors.TEXT_DEFAULT,
    },
    subtitle: {
      marginTop: 4,
      fontSize: 14,
      fontWeight: "600",
      color: semanticColors.TEXT_MUTED,
    },
    animatedIndicator: {
      position: "absolute",
      top: 8,
      right: 8,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      borderRadius: 10,
      width: 20,
      height: 20,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1,
    },
    gifText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "bold",
    },
    avatarPlaceholder: {
      width: 48,
      height: 48,
      tintColor: semanticColors.INTERACTIVE_NORMAL,
    },
  });

  // Fetch user's avatar on component mount
  React.useEffect(() => {
    if (currentUser) {
      let url;
      let animated = false;

      // Check if avatar is animated (starts with "a_")
      const hasAnimatedAvatar = currentUser.avatar?.startsWith("a_");

      // Try to get the user's custom avatar first
      if (getUserAvatarURL && currentUser.avatar) {
        // Use animated parameter for GIF avatars
        url = getUserAvatarURL(currentUser, hasAnimatedAvatar);
        animated = hasAnimatedAvatar;
      }
      // Fall back to default avatar
      else if (getDefaultAvatarURL) {
        url = getDefaultAvatarURL(currentUser);
      }
      // Last resort: Construct Discord CDN URL
      else if (currentUser.avatar) {
        const isGif = currentUser.avatar.startsWith("a_");
        url = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.${isGif ? "gif" : "png"}?size=256`;
        animated = isGif;
      } else {
        // Default Discord avatar based on discriminator or id
        const defaultAvatarIndex = currentUser.discriminator
          ? parseInt(currentUser.discriminator) % 5
          : (parseInt(currentUser.id) >> 22) % 6;
        url = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
      }

      setAvatarUrl(url);
      setIsAnimatedAvatar(animated);
    }
  }, [currentUser]);

  const handleAvatarPress = () => {
    if (storage.hiddenSettings?.enabled) {
      storage.hiddenSettings.visible = !storage.hiddenSettings.visible;
      showToast(
        i18n.t("toasts.hidden_settings_status", {
          status: storage.hiddenSettings.visible
            ? i18n.t("ui.status.visible")
            : i18n.t("ui.status.hidden"),
        }),
        getAssetIDByName("SettingsIcon"),
      );
      const refresh = (globalThis as any).__animalCommandsRefreshSettings;
      if (typeof refresh === "function") refresh();
      return;
    }

    if (clickTimeout) {
      clearTimeout(clickTimeout);
    }

    const newTimeout = setTimeout(() => {
      setClickCounter(0);
    }, 1000);
    setClickTimeout(newTimeout);

    const newCounter = clickCounter + 1;
    setClickCounter(newCounter);

    if (newCounter < 10) {
      return;
    }

    showToast(i18n.t("toasts.hidden_settings_unlocked"), getAssetIDByName("CheckmarkIcon"));
    storage.hiddenSettings = {
      ...storage.hiddenSettings,
      enabled: true,
      visible: true,
    };
    const refresh = (globalThis as any).__animalCommandsRefreshSettings;
    if (typeof refresh === "function") refresh();
    setClickCounter(0);
  };

  return (
    <RN.View style={styles.container}>
      <RN.View style={styles.leftSection}>
        <RN.Pressable
          style={styles.avatarContainer}
          onPress={handleAvatarPress}
        >
          <RN.View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <>
                <RN.Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatar}
                  resizeMode="cover"
                />
                {isAnimatedAvatar && (
                  <RN.View style={styles.animatedIndicator}>
                    <RN.Text style={styles.gifText}>GIF</RN.Text>
                  </RN.View>
                )}
              </>
            ) : (
              <RN.Image
                source={getAssetIDByName("ic_account_circle_24px")}
                style={styles.avatarPlaceholder}
              />
            )}
          </RN.View>

        </RN.Pressable>

        <RN.View style={styles.textContainer}>
          <RN.Text style={styles.title}>{i18n.t("settings.header.title")}</RN.Text>
          <RN.Text style={styles.subtitle}>
            {i18n.t("settings.header.subtitle")}
          </RN.Text>
        </RN.View>
      </RN.View>
    </RN.View>
  );
}
