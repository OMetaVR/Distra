import { Alert, ScrollView, View } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import {
    type BaseTheme,
    type InstalledTheme,
    installFromText,
    installFromUrl,
    removeTheme,
    selectTheme,
    setBase,
    setHideBackground,
    themeInfo,
    themeState,
    updateThemes,
} from "@/lib/themes";
import { errorToString, isHttpUrl } from "@/lib/utils";
import { clipboard, NavigationNative } from "@/metro/common";
import { confirm, prompt } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";
import { openPage } from "@/ui/settings";
import { showToast } from "@/ui/toasts";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;
const Check = () => <TableRow.Icon source={findAssetId("CheckmarkLargeIcon")} />;

export const BASE_LABELS: Record<"auto" | BaseTheme, string> = {
    auto: "Match Discord",
    dark: "Ash",
    darker: "Dark",
    midnight: "Onyx",
    light: "Light",
};

const FORMAT_LABELS = { vendetta: "Vendetta", bunny: "Bunny", enmity: "Enmity" };

export function Swatches({ colors }: { colors: string[] }) {
    return (
        <View style={{ flexDirection: "row", gap: 3 }}>
            {colors.slice(0, 4).map((color, i) => (
                <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 1, borderColor: "#80808060" }} />
            ))}
        </View>
    );
}

export function describe(info: ReturnType<typeof themeInfo>) {
    if (!info) return "Unreadable theme";
    const authors = info.authors.map(author => author.name).join(", ");
    const modes = info.modes === "both" ? "dark & light" : info.modes;
    return [authors && `by ${authors}`, `${FORMAT_LABELS[info.format]} · ${modes}`].filter(Boolean).join(" · ");
}

function run(action: () => unknown, success?: string) {
    try {
        action();
        if (success) showToast(success);
    } catch (e) {
        Alert.alert("Theme error", errorToString(e));
    }
}

function chooseBase() {
    Alert.alert("Base theme", "What the theme falls back to for anything it doesn't colour. Themes with only dark colours use them on Onyx too.", [
        ...(Object.keys(BASE_LABELS) as (keyof typeof BASE_LABELS)[]).map(base => ({
            text: `${BASE_LABELS[base]}${themeState.base === base ? " ✓" : ""}`,
            onPress: () => run(() => setBase(base)),
        })),
        { text: "Cancel", style: "cancel" as const },
    ]);
}

async function installLink() {
    const url = await prompt({ title: "Install theme", message: "Link to a theme's .json file", confirmText: "Install" });
    if (!url) return;
    if (!isHttpUrl(url.trim())) return Alert.alert("Install theme", "That doesn't look like a link.");
    try {
        const theme = await installFromUrl(url);
        if (await confirm({ title: `Installed ${themeInfo(theme)?.name ?? "theme"}`, message: "Apply it now?", confirmText: "Apply" })) run(() => selectTheme(theme.id));
    } catch (e) {
        Alert.alert("Couldn't install the theme", errorToString(e));
    }
}

async function installClipboard() {
    const text = await clipboard.getString();
    if (!text?.trim()) return Alert.alert("Paste theme", "The clipboard is empty.");
    if (isHttpUrl(text.trim())) {
        try {
            const theme = await installFromUrl(text);
            return run(() => selectTheme(theme.id), `Applied ${themeInfo(theme)?.name ?? "theme"}`);
        } catch (e) {
            return Alert.alert("Couldn't install the theme", errorToString(e));
        }
    }
    try {
        const theme = installFromText(text);
        run(() => selectTheme(theme.id), `Applied ${themeInfo(theme)?.name ?? "theme"}`);
    } catch (e) {
        Alert.alert("Couldn't install the theme", errorToString(e));
    }
}

function themeActions(theme: InstalledTheme) {
    const info = themeInfo(theme);
    Alert.alert(info?.name ?? theme.id, [describe(info), info?.description].filter(Boolean).join("\n\n"), [
        ...(theme.url ? [{ text: "Copy link", onPress: () => { clipboard.setString(theme.url!); showToast("Copied"); } }] : []),
        { text: "Copy theme file", onPress: () => { clipboard.setString(JSON.stringify(theme.manifest, null, 2)); showToast("Copied"); } },
        {
            text: "Remove",
            style: "destructive" as const,
            onPress: async () => {
                if (await confirm({ title: `Remove ${info?.name ?? "theme"}?`, confirmText: "Remove", destructive: true })) run(() => removeTheme(theme.id));
            },
        },
        { text: "Cancel", style: "cancel" as const },
    ]);
}

export default function Themes() {
    useProxy(themeState);
    const navigation = NavigationNative.useNavigation();
    const installed = Object.values(themeState.installed).sort((a, b) => (themeInfo(a)?.name ?? "").localeCompare(themeInfo(b)?.name ?? ""));

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Theme">
                    <TableRow
                        label="Discord default"
                        subLabel="No theme"
                        icon={<Icon name="PaintPaletteIcon" />}
                        trailing={themeState.selected === null ? <Check /> : undefined}
                        onPress={() => run(() => selectTheme(null))}
                    />
                    {installed.map(theme => {
                        const info = themeInfo(theme);
                        const selected = themeState.selected === theme.id;
                        return (
                            <TableRow
                                key={theme.id}
                                label={info?.name ?? theme.id}
                                subLabel={describe(info)}
                                icon={info ? <Swatches colors={info.swatches} /> : <Icon name="WarningIcon" />}
                                trailing={selected ? <Check /> : undefined}
                                onPress={() => info && run(() => selectTheme(selected ? null : theme.id))}
                                onLongPress={() => themeActions(theme)}
                            />
                        );
                    })}
                </TableRowGroup>

                <TableRowGroup title="Add themes">
                    <TableRow
                        label="Theme Library"
                        subLabel="Themes that come with Distra"
                        icon={<Icon name="GridSquareIcon" />}
                        arrow
                        onPress={() => import("./ThemeLibrary").then(({ default: Library }) => openPage("Theme Library", Library, navigation))}
                    />
                    <TableRow label="Install from link" icon={<Icon name="LinkIcon" />} onPress={installLink} />
                    <TableRow label="Paste from clipboard" subLabel="A theme link or theme file" icon={<Icon name="ClipboardListIcon" />} onPress={installClipboard} />
                </TableRowGroup>

                <TableRowGroup title="Options">
                    <TableRow
                        label="Base theme"
                        subLabel="What themes fall back to"
                        icon={<Icon name="SettingsIcon" />}
                        trailing={<TableRowTrailingText text={BASE_LABELS[themeState.base]} />}
                        onPress={chooseBase}
                    />
                    <TableSwitchRow
                        label="Hide theme backgrounds"
                        subLabel="Keep the chat background plain even if the theme has an image"
                        icon={<Icon name="ImageIcon" />}
                        value={themeState.hideBackground}
                        onValueChange={(value: boolean) => run(() => setHideBackground(value))}
                    />
                    <TableRow
                        label="Update themes"
                        subLabel="Re-download themes installed from links"
                        icon={<Icon name="DownloadIcon" />}
                        onPress={async () => {
                            const failed = await updateThemes();
                            showToast(failed ? `${failed} theme${failed === 1 ? "" : "s"} couldn't be updated` : "Themes updated");
                        }}
                    />
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    Distra reads Vendetta, Bunny and Enmity theme files. Hold a theme for more options. Themes only change
                    how Discord looks on this device; your Discord appearance setting is left as it is.
                </Text>
            </Stack>
        </ScrollView>
    );
}
