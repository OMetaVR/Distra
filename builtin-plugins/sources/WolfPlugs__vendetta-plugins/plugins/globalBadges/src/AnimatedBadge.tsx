import { React, ReactNative as RN } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";

// Distra: badges from other mods are often animated WebP. Discord's badge image (React Native's
// Image) only shows their first frame; Discord's FastImage (SDWebImage, with a WebP coder) plays them.
const FastImage = (window as any).distra?.metro?.findByFilePath?.("components_native/common/FastImage.tsx")?.default;

export const canAnimate = () => FastImage != null;

export default function AnimatedBadge({ uri, label, size = 20 }: { uri: string; label: string; size?: number }) {
  return (
    <RN.Pressable
      accessibilityRole="image"
      accessibilityLabel={`Badge, ${label}`}
      hitSlop={4}
      onPress={() => showToast(label)}
    >
      <FastImage source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" enableAnimation />
    </RN.Pressable>
  );
}
