import { Image, ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Stack, TableRadioGroup, TableRadioRow, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";

import { type BadgeGroup, type Placement, settings, state } from "./settings";

const GROUP_INFO: Record<BadgeGroup, { label: string; subLabel: string; icon: string }> = {
    global: {
        label: "Global Badges",
        subLabel: "Badges from other mods (Vencord, Equicord, Bunny, ...). Needs the Global Badges plugin enabled.",
        icon: "https://cdn.discordapp.com/emojis/1026533070955872337.png",
    },
    discord: {
        label: "Discord badges",
        subLabel: "HypeSquad, Early Supporter, Bug Hunter, ... (all profile badges once their profile was opened)",
        icon: "https://cdn.discordapp.com/badge-icons/bf01d1073931f921909045f3a39fd264.png",
    },
    nitro: {
        label: "Nitro",
        subLabel: "Discord only shares this for people whose profile you opened",
        icon: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png",
    },
};

const LIMITS = [3, 5, 10, 0];

function moveUp(group: BadgeGroup) {
    const order = [...settings.order];
    const index = order.indexOf(group);
    if (index <= 0) return;
    [order[index - 1], order[index]] = [order[index], order[index - 1]];
    settings.order = order;
}

export default function SettingsPage() {
    useProxy(settings);

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Badges">
                    {settings.order.map(group => (
                        <TableSwitchRow
                            key={group}
                            label={GROUP_INFO[group].label}
                            subLabel={GROUP_INFO[group].subLabel}
                            icon={<Image source={{ uri: GROUP_INFO[group].icon }} style={{ width: 20, height: 20 }} />}
                            value={settings.show[group]}
                            onValueChange={(value: boolean) => void (settings.show = { ...settings.show, [group]: value })}
                        />
                    ))}
                </TableRowGroup>
                <TableRowGroup title="Order (tap to move up)">
                    {settings.order.map((group, index) => (
                        <TableRow
                            key={group}
                            label={`${index + 1}. ${GROUP_INFO[group].label}`}
                            icon={<TableRow.Icon source={findAssetId("ArrowsUpDownIcon")} />}
                            disabled={index === 0}
                            onPress={() => moveUp(group)}
                        />
                    ))}
                </TableRowGroup>
                <TableRowGroup title="Amount">
                    <TableRow
                        label="Most badges per message"
                        subLabel="Tap to change. Some people have a dozen Global Badges."
                        icon={<TableRow.Icon source={findAssetId("ic_badge_staff")} />}
                        trailing={<TableRowTrailingText text={settings.limit > 0 ? String(settings.limit) : "All"} />}
                        onPress={() => void (settings.limit = LIMITS[(LIMITS.indexOf(settings.limit) + 1) % LIMITS.length])}
                    />
                </TableRowGroup>
                <TableRadioGroup title="Where" value={settings.placement} onChange={(value: Placement) => void (settings.placement = value)}>
                    <TableRadioRow
                        label="Next to the name and time"
                        subLabel={state.nativeHeader
                            ? "After the timestamp, on a second header line when they don't fit"
                            : "Needs a newer Distra tweak; for now they get their own line above the message"}
                        value="header"
                    />
                    <TableRadioRow label="Above the message" subLabel="On their own line above the message text" value="text" />
                    <TableRadioRow label="In the role icon spot" subLabel="The first badge goes where role icons go (when the author has none), the rest next to the name and time" value="name" />
                </TableRadioGroup>
                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Tap a badge in chat to see its name (reopen a chat after enabling). Changes apply as messages redraw.
                </Text>
            </Stack>
        </ScrollView>
    );
}
