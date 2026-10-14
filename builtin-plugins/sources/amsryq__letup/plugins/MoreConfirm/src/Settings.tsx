import { findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableSwitchRow, Stack, TableRow } = findByProps("TableSwitchRow", "TableRowGroup", "Stack", "TableRow");

// One switch per action MoreConfirm asks about. Anything not set yet counts as on.
const options = [
    { key: "voiceCalls", label: "Voice calls", subLabel: "Ask before starting a voice call or group call.", icon: "PhoneCallIcon" },
    { key: "videoCalls", label: "Video calls", subLabel: "Ask before starting a video call or group video call.", icon: "VideoIcon" },
    { key: "addFriend", label: "Friend requests", subLabel: "Ask before sending a friend request or accepting one.", icon: "UserPlusIcon" },
    { key: "block", label: "Blocking", subLabel: "Ask before blocking someone.", icon: "UserMinusIcon" },
];

export default function Settings() {
    useProxy(storage);

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Ask for confirmation before...">
                    {options.map(({ key, label, subLabel, icon }) => (
                        <TableSwitchRow
                            key={key}
                            label={label}
                            subLabel={subLabel}
                            icon={<TableRow.Icon source={getAssetIDByName(icon) ?? getAssetIDByName("CheckmarkLargeIcon")} />}
                            value={(storage as Record<string, any>)[key] !== false}
                            onValueChange={(value: boolean) => ((storage as Record<string, any>)[key] = value)}
                        />
                    ))}
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}
