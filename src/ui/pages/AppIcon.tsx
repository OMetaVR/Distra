import { Alert, ScrollView } from "react-native";

import { findAssetId } from "@/lib/assets";
import { getAppIcons, setAppIcon } from "@/lib/appicons";
import { errorToString } from "@/lib/utils";
import { Stack, TableRow, TableRowGroup, Text } from "@/ui/components";
import { useAsync } from "@/ui/hooks/useAsync";

const Check = () => <TableRow.Icon source={findAssetId("CheckmarkLargeIcon")} />;

/** "BlurpleTwilightIcon" -> "Blurple Twilight" */
const prettify = (name: string) => name.replace(/Icon$/, "").replace(/([a-z])([A-Z0-9])/g, "$1 $2");

export default function AppIcon() {
    const { value: info, error, reload } = useAsync(getAppIcons);

    const choose = async (name: string | null) => {
        try {
            await setAppIcon(name);
        } catch (e) {
            Alert.alert("Couldn't change the icon", errorToString(e));
        }
        reload();
    };

    // Distra's icons sort first; IPA builds name them "Distra*".
    const icons = [...(info?.icons ?? [])].sort((a, b) =>
        Number(b.name.startsWith("Distra")) - Number(a.name.startsWith("Distra")) || a.name.localeCompare(b.name));

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                {info && !info.supported && (
                    <Text variant="text-sm/medium" color="text-warning">This device does not support alternate app icons.</Text>
                )}
                {error ? <Text variant="text-sm/medium" color="text-danger">{errorToString(error)}</Text> : null}

                <TableRowGroup title="App icon">
                    <TableRow label="Default" trailing={info?.current === null ? <Check /> : undefined} onPress={() => choose(null)} />
                    {icons.map(icon => (
                        <TableRow
                            key={icon.name}
                            label={prettify(icon.name)}
                            trailing={info?.current === icon.name ? <Check /> : undefined}
                            onPress={() => choose(icon.name)}
                        />
                    ))}
                </TableRowGroup>

                <Text variant="text-sm/medium" color="text-muted">
                    iOS can only switch to icons that are built into the app. Distra IPA builds include extra icons.
                </Text>
            </Stack>
        </ScrollView>
    );
}
