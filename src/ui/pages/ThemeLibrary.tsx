// Themes bundled with Distra. Tapping one adds it to your themes and applies it.

import { useState } from "react";
import { Alert, Linking, ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { addFromLibrary, LIBRARY, type LibraryTheme, selectTheme, themeState } from "@/lib/themes";
import { describeTheme } from "@/lib/themes/parser";
import { errorToString } from "@/lib/utils";
import { Stack, TableRow, TableRowGroup, Text, TextInput } from "@/ui/components";
import { findAssetId } from "@/lib/assets";
import { showToast } from "@/ui/toasts";

import { describe, Swatches } from "./Themes";

const Check = () => <TableRow.Icon source={findAssetId("CheckmarkLargeIcon")} />;
const libraryId = (entry: LibraryTheme) => `library:${entry.id}`;

const entries = LIBRARY.map(entry => {
    try {
        return { entry, info: describeTheme(entry.manifest) };
    } catch {
        return null;
    }
}).filter(Boolean) as { entry: LibraryTheme; info: ReturnType<typeof describeTheme> }[];

function apply(entry: LibraryTheme, name: string) {
    try {
        const theme = addFromLibrary(entry);
        if (themeState.selected === theme.id) return selectTheme(null);
        selectTheme(theme.id);
        showToast(`Applied ${name}`);
    } catch (e) {
        Alert.alert("Couldn't apply the theme", errorToString(e));
    }
}

function details(entry: LibraryTheme, info: ReturnType<typeof describeTheme>) {
    Alert.alert(info.name, [info.description, `${describe(info)}\nLicence: ${entry.license}`].filter(Boolean).join("\n\n"), [
        { text: "Apply", onPress: () => apply(entry, info.name) },
        { text: "Open source", onPress: () => Linking.openURL(entry.source) },
        { text: "Close", style: "cancel" },
    ]);
}

export default function ThemeLibrary() {
    useProxy(themeState);
    const [query, setQuery] = useState("");
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const visible = entries.filter(({ entry, info }) => {
        const haystack = `${info.name} ${info.description ?? ""} ${entry.author} ${info.format}`.toLowerCase();
        return words.every(word => haystack.includes(word));
    });

    const row = ({ entry, info }: (typeof entries)[number]) => (
        <TableRow
            key={entry.id}
            label={info.name}
            subLabel={describe({ ...info, authors: info.authors.length ? info.authors : [{ name: entry.author }] })}
            icon={<Swatches colors={info.swatches} />}
            trailing={themeState.selected === libraryId(entry) ? <Check /> : undefined}
            onPress={() => apply(entry, info.name)}
            onLongPress={() => details(entry, info)}
        />
    );

    const official = visible.filter(({ entry }) => entry.official);
    const community = visible.filter(({ entry }) => !entry.official);

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }} keyboardShouldPersistTaps="handled">
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TextInput placeholder="Search themes" size="md" isClearable defaultValue={query} onChange={(value: string) => setQuery(value)} />
                {official.length ? <TableRowGroup title="Made for Distra">{official.map(row)}</TableRowGroup> : null}
                {community.length ? <TableRowGroup title="Community">{community.map(row)}</TableRowGroup> : null}
                <Text variant="text-sm/medium" color="text-muted">
                    Tap a theme to apply it, tap it again to go back to Discord's colours, and hold it for details.
                    Community themes are included under their authors' licences (MIT and BSD); many were made for older
                    Discord versions, so Distra maps their colours onto the current design.
                </Text>
            </Stack>
        </ScrollView>
    );
}
