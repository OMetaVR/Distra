import { Image, ScrollView } from "react-native";

import { Stack, TableRow, TableRowGroup, TableRowTrailingText, Text } from "@/ui/components";

import { ranks } from "./ranks";

export default function SettingsPage() {
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Ranks">
                    {ranks.map(rank => (
                        <TableRow
                            key={rank.id}
                            label={rank.title}
                            subLabel={rank.description}
                            icon={<Image source={{ uri: rank.icon }} style={{ width: 24, height: 24 }} accessibilityIgnoresInvertColors />}
                            trailing={<TableRowTrailingText text={rank.after} />}
                        />
                    ))}
                </TableRowGroup>
                <Text variant="text-sm/medium" color="text-muted">
                    A friend's profile shows the rank you've reached together next to their badges. Tap it to see how
                    long you've been friends.
                </Text>
            </Stack>
        </ScrollView>
    );
}
