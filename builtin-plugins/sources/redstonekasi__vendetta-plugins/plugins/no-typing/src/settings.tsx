import { findByProps } from "@vendetta/metro";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { React } from "@vendetta/metro/common";
import { syncChatButton } from "./chatbutton";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableSwitchRow, Stack, TableRow } = findByProps("TableSwitchRow", "TableRowGroup", "Stack", "TableRow");

export default function Settings() {
  useProxy(storage);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
      <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
        <TableRowGroup title="Typing indicator">
          <TableSwitchRow
            label="Hide when I type"
            subLabel={'Other people won\'t see "is typing..." while you write.'}
            icon={<TableRow.Icon source={getAssetIDByName("KeyboardIcon")} />}
            value={storage.hidden !== false}
            onValueChange={(value: boolean) => (storage.hidden = value)}
          />
          <TableSwitchRow
            label="Chat bar button"
            subLabel="A keyboard button next to the chat bar's other buttons that switches this on and off. Crossed out while your typing is hidden."
            icon={<TableRow.Icon source={getAssetIDByName("KeyboardIcon")} />}
            value={storage.chatButton !== false}
            onValueChange={(value: boolean) => {
              storage.chatButton = value;
              syncChatButton();
            }}
          />
        </TableRowGroup>
      </Stack>
    </ScrollView>
  );
}
