import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { SettingsScrollView, Stack, TableRow, TableRowGroup, TableSwitchRow } from "../utils/table";

export default function Settings() {
    useProxy(storage);

    return (
        <SettingsScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
            <Stack spacing={8}>
                <TableRowGroup title="Layout">
                    <TableSwitchRow
                        label="Hide the DMs tile"
                        subLabel="Remove the DMs tile from the drawer entirely"
                        value={!!storage.hideDmTile}
                        onValueChange={(v: boolean) => { storage.hideDmTile = v; }}
                    />
                    <TableSwitchRow
                        label="Show server and folder names"
                        subLabel="Print each server&apos;s name under its icon in the drawer"
                        value={!!storage.showGuildNames}
                        onValueChange={(v: boolean) => { storage.showGuildNames = v; }}
                    />
                </TableRowGroup>
                <TableRowGroup title="Folders">
                    <TableSwitchRow
                        label="Open folders in a side list"
                        subLabel="An open folder's servers appear in their own list to the right of the grid instead of among the other servers. The list only takes room while a folder is open."
                        value={storage.folderLayout === "sidebar"}
                        onValueChange={(v: boolean) => { storage.folderLayout = v ? "sidebar" : "inline"; }}
                    />
                    <TableSwitchRow
                        label="Separator after open folders"
                        subLabel="Draw a line where an open folder's servers end and the rest of your servers continue."
                        value={storage.folderSeparator !== false}
                        onValueChange={(v: boolean) => { storage.folderSeparator = v; }}
                    />
                </TableRowGroup>
                <TableRowGroup title="About">
                    <TableRow
                        label="Server Drawer"
                        subLabel="Replaces the Quest Dock with a grid of your servers"
                    />
                    <TableRow label="Author" subLabel="kmmiio99o, Rosie" />
                </TableRowGroup>
            </Stack>
        </SettingsScrollView>
    );
}
