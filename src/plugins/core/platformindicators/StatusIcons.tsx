import { Image, View } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { findByStoreNameLazy } from "@/metro";
import { useStateFromStores } from "@/metro/common";

import { settings } from "./settings";

const PresenceStore = findByStoreNameLazy("PresenceStore");

const PLATFORM_ICONS: Record<string, string> = {
    desktop: "ScreenIcon",
    mobile: "MobilePhoneIcon",
    web: "GlobeEarthIcon",
    embedded: "GameControllerIcon",
    vr: "VrHeadsetIcon",
};

export default function StatusIcons({ userId, size = 14 }: { userId: string; size?: number }) {
    useProxy(settings);
    const clientStatus: Record<string, string> = useStateFromStores([PresenceStore], () => PresenceStore.getClientStatus?.(userId) ?? {}, [userId]);
    const platforms = Object.entries(clientStatus ?? {}).filter(([platform, status]) => PLATFORM_ICONS[platform] && status && status !== "offline");
    if (!platforms.length || (!settings.showSinglePlatform && platforms.length < 2)) return null;

    return (
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 4, gap: 2 }}>
            {platforms.map(([platform, status]) => (
                <Image
                    key={platform}
                    source={findAssetId(PLATFORM_ICONS[platform])}
                    style={{ width: size, height: size, tintColor: (settings.colors as Record<string, string>)[status] ?? settings.colors.online }}
                />
            ))}
        </View>
    );
}
