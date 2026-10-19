import { useEffect, useReducer, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { folderColor, getIcon, onIconsChanged } from "./data";
import { type FolderIcon, settings } from "./settings";

/** The image on the folder's colour, the way Equicord draws it (faded colour unless "solid background"). */
export function CustomIcon({ icon, color, size, radius, onError }: {
    icon: FolderIcon;
    color?: number | null;
    size: number;
    radius?: number;
    onError?: () => void;
}) {
    const percent = Math.min(100, Math.max(25, icon.size || 100));
    return (
        <View style={{ width: size, height: size, borderRadius: radius ?? size / 3, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: folderColor(color), opacity: settings.solidBackground ? 1 : 0.4 }]} />
            <Image
                source={{ uri: icon.url }}
                style={{ width: `${percent}%`, height: `${percent}%` }}
                resizeMode={percent >= 100 ? "cover" : "contain"}
                onError={onError}
                accessibilityIgnoresInvertColors
            />
        </View>
    );
}

/**
 * A folder's custom icon if it has one, otherwise `children` (the folder's own look). Also falls back
 * to `children` when the image fails to load. Exposed to other plugins (Server Drawer) as `api.FolderIcon`.
 */
export function FolderIconView({ folderId, color, size, radius, children }: {
    folderId: string | number;
    color?: number | null;
    size: number;
    radius?: number;
    children?: React.ReactNode;
}) {
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => onIconsChanged(rerender), []);
    const icon = getIcon(folderId);
    const [failed, setFailed] = useState<string>();
    if (!icon?.url || failed === icon.url) return <>{children}</>;
    return <CustomIcon icon={icon} color={color} size={size} radius={radius} onError={() => setFailed(icon.url)} />;
}
