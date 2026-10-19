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
                <TableRowGroup title="Dock">
                    <TableSwitchRow
                        label="Hide while scrolling"
                        subLabel="Tuck the server row away when you scroll down a list and bring it back when you scroll up (Discord's behaviour for the quest dock)."
                        value={!!storage.hideOnScroll}
                        onValueChange={(v: boolean) => { storage.hideOnScroll = v; }}
                    />
                </TableRowGroup>
                <TableRowGroup title="Folders">
                    <TableSwitchRow
                        label="Close other folders"
                        subLabel="Opening a folder closes any other open folder, so only one is open at a time."
                        value={!!storage.collapseOtherFolders}
                        onValueChange={(v: boolean) => { storage.collapseOtherFolders = v; }}
                    />
                    <TableSwitchRow
                        label="Folder animation"
                        subLabel="An opening folder's servers slide out of it, and the rest glide to their new places."
                        value={storage.folderAnimation !== false}
                        onValueChange={(v: boolean) => { storage.folderAnimation = v; }}
                    />
                    <TableSwitchRow
                        label="Separator after open folders"
                        subLabel="Draw a line where an open folder's servers end and the rest of your servers continue (in the open drawer)."
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
