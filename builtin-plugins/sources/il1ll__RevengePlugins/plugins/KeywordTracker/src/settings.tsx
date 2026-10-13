import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRow, TableSwitchRow, Stack, TextInput } = findByProps(
  "TableSwitchRow",
  "TableRowGroup",
  "Stack",
  "TableRow",
  "TextInput"
);
const { Text } = findByProps("Text", "View");
const { Clipboard } = RN;

export default function Settings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const [newKeyword, setNewKeyword] = React.useState("");

  const addKeyword = () => {
    if (!newKeyword.trim()) {
      showToast("Please enter a keyword", getAssetIDByName("Small"));
      return;
    }

    const kw = newKeyword.trim();
    if (!storage.keywords.includes(kw)) {
      storage.keywords = [...storage.keywords, kw];
      setNewKeyword("");
      forceUpdate();
      showToast("Keyword added", getAssetIDByName("Check"));
    } else {
      showToast("Keyword already exists", getAssetIDByName("Warning"));
    }
  };

  const removeKeyword = (kw: string) => {
    storage.keywords = storage.keywords.filter((k: string) => k !== kw);
    forceUpdate();
    showToast("Keyword removed", getAssetIDByName("Check"));
  };

  const exportKeywords = () => {
    Clipboard.setString(JSON.stringify(storage.keywords));
    showToast("Exported to clipboard", getAssetIDByName("Check"));
  };

  const importKeywords = async () => {
    const text = await Clipboard.getString();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        storage.keywords = parsed;
        forceUpdate();
        showToast("Imported successfully", getAssetIDByName("Check"));
      } else {
        showToast("Invalid JSON format", getAssetIDByName("Warning"));
      }
    } catch (e) {
      showToast("Invalid JSON format", getAssetIDByName("Warning"));
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>

        <TableRowGroup title="Add Keyword">
          <Stack spacing={4}>
            <TextInput
              placeholder="Enter keyword or phrase..."
              value={newKeyword}
              onChange={setNewKeyword}
              isClearable
              onSubmitEditing={addKeyword}
              returnKeyType="done"
            />
          </Stack>
        </TableRowGroup>

        <TableRowGroup>
          <TableRow
            label="Add Keyword"
            subLabel="Add the typed word or phrase to your tracking list"
            trailing={<TableRow.Arrow />}
            onPress={addKeyword}
          />
        </TableRowGroup>

        {storage.keywords && storage.keywords.length > 0 && (
          <TableRowGroup title="Tracked Keywords">
            {storage.keywords.map((kw: string, index: number) => (
              <TableRow
                key={index}
                label={kw}
                trailing={
                  <RN.TouchableOpacity
                    onPress={() => removeKeyword(kw)}
                    style={{
                      padding: 8,
                      backgroundColor: "#ff4d4d",
                      borderRadius: 12,
                      width: 24,
                      height: 24,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <RN.Image
                      source={getAssetIDByName("TrashIcon")}
                      style={{ width: 14, height: 14, tintColor: "#ffffff" }}
                    />
                  </RN.TouchableOpacity>
                }
              />
            ))}
          </TableRowGroup>
        )}

        <TableRowGroup title="Data Management">
          <TableRow
            label="Export JSON"
            subLabel="Copy your keywords list to the clipboard"
            trailing={<TableRow.Arrow />}
            onPress={exportKeywords}
          />
          <TableRow
            label="Import JSON"
            subLabel="Load a keywords list from your clipboard"
            trailing={<TableRow.Arrow />}
            onPress={importKeywords}
          />
        </TableRowGroup>

        <TableRowGroup title="Plugin Settings">
          <TableSwitchRow
            label="Show in Settings"
            subLabel="Add a shortcut to this plugin in settings page"
            value={storage.showInSettings}
            onValueChange={(v: boolean) => { storage.showInSettings = v; forceUpdate(); }}
          />
        </TableRowGroup>

        <TableRowGroup title="Tracking Target">
          <TableSwitchRow
            label="Track Everyone"
            subLabel="Listen to messages from all users"
            value={storage.trackMode === "everyone"}
            onValueChange={() => { storage.trackMode = "everyone"; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track Friends Only"
            subLabel="Only listen to messages sent by your added friends"
            value={storage.trackMode === "friends"}
            onValueChange={() => { storage.trackMode = "friends"; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track Custom Users"
            subLabel="Only listen to messages from specific user IDs"
            value={storage.trackMode === "custom"}
            onValueChange={() => { storage.trackMode = "custom"; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Ignore Bots"
            subLabel="Do not track messages sent by Discord bots"
            value={storage.ignoreBots}
            onValueChange={(v: boolean) => { 
              storage.ignoreBots = v; 
              if (v) storage.trackEmbeds = false;
              forceUpdate(); 
            }}
          />
          <TableSwitchRow
            label="Track Embeds"
            subLabel="Track keywords inside embedded messages"
            value={storage.trackEmbeds}
            onValueChange={(v: boolean) => { 
              storage.trackEmbeds = v; 
              if (v) storage.ignoreBots = false;
              forceUpdate(); 
            }}
          />
        </TableRowGroup>

        {storage.trackMode === "custom" && (
          <TableRowGroup title="Custom User IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <TextInput
                placeholder="1099039269391171765, 845374453939568720"
                value={storage.customIds}
                onChange={(v: string) => { storage.customIds = v; forceUpdate(); }}
              />
            </Stack>
          </TableRowGroup>
        )}

        <TableRowGroup title="Tracking Locations">
          <TableSwitchRow
            label="Track Servers"
            subLabel="Monitor messages sent in servers"
            value={storage.trackServers}
            onValueChange={(v: boolean) => { 
              storage.trackServers = v; 
              if (!v) storage.ignoreServersEnabled = false;
              forceUpdate(); 
            }}
          />
          <TableSwitchRow
            label="Track Group DMs"
            subLabel="Monitor messages sent in group DMs"
            value={storage.trackGroups}
            onValueChange={(v: boolean) => { storage.trackGroups = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track DMs"
            subLabel="Monitor messages sent in direct messages"
            value={storage.trackDMs}
            onValueChange={(v: boolean) => { storage.trackDMs = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track Channels"
            subLabel="Track specific channels even if they are in an ignored server"
            value={storage.trackChannelsEnabled}
            onValueChange={(v: boolean) => { storage.trackChannelsEnabled = v; forceUpdate(); }}
          />
        </TableRowGroup>

        {storage.trackChannelsEnabled && (
          <TableRowGroup title="Tracked Channel IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <TextInput
                placeholder="1205207690352005243, 1296197038006075543"
                value={storage.trackedChannelIds}
                onChange={(v: string) => { storage.trackedChannelIds = v; forceUpdate(); }}
              />
            </Stack>
          </TableRowGroup>
        )}

        <TableRowGroup title="Ignoring">
          <TableSwitchRow
            label="Ignore Servers"
            subLabel="Do not track messages from specific servers"
            value={storage.ignoreServersEnabled}
            onValueChange={(v: boolean) => { 
              storage.ignoreServersEnabled = v; 
              if (v) storage.trackServers = true;
              forceUpdate(); 
            }}
          />
          <TableSwitchRow
            label="Ignore Channels"
            subLabel="Do not track messages from specific channels, DMs, or groups"
            value={storage.ignoreChannelsEnabled}
            onValueChange={(v: boolean) => { storage.ignoreChannelsEnabled = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Ignore Users"
            subLabel="Do not track messages from specific users"
            value={storage.ignoreUsersEnabled}
            onValueChange={(v: boolean) => { storage.ignoreUsersEnabled = v; forceUpdate(); }}
          />
        </TableRowGroup>

        {storage.ignoreServersEnabled && (
          <TableRowGroup title="Ignored Server IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <TextInput
                placeholder="1205207689832038522, 1196075698301968455"
                value={storage.ignoredServerIds}
                onChange={(v: string) => { storage.ignoredServerIds = v; forceUpdate(); }}
              />
            </Stack>
          </TableRowGroup>
        )}

        {storage.ignoreChannelsEnabled && (
          <TableRowGroup title="Ignored Channel IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <TextInput
                placeholder="1306947192594108467, 1284131216156655646"
                value={storage.ignoredChannelIds}
                onChange={(v: string) => { storage.ignoredChannelIds = v; forceUpdate(); }}
              />
            </Stack>
          </TableRowGroup>
        )}

        {storage.ignoreUsersEnabled && (
          <TableRowGroup title="Ignored User IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <TextInput
                placeholder="1099039269391171765, 845374453939568720"
                value={storage.ignoredUserIds}
                onChange={(v: string) => { storage.ignoredUserIds = v; forceUpdate(); }}
              />
            </Stack>
          </TableRowGroup>
        )}

        <TableRowGroup title="Matching Rules">
          <TableSwitchRow
            label="Match Whole Words"
            subLabel="Match keyword as a standalone word only, not inside another word"
            value={storage.wholeWords}
            onValueChange={(v: boolean) => { storage.wholeWords = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Exact Match"
            subLabel="The message content must be exactly the keyword with no other words"
            value={storage.exactMatch}
            onValueChange={(v: boolean) => { storage.exactMatch = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Case Sensitive"
            subLabel="Match the exact uppercase and lowercase letters of the keyword"
            value={storage.caseSensitive}
            onValueChange={(v: boolean) => { storage.caseSensitive = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Match in a Sentence"
            subLabel="The keyword can be detected even if it is part of a longer word"
            value={storage.inSentence}
            onValueChange={(v: boolean) => { storage.inSentence = v; forceUpdate(); }}
          />
        </TableRowGroup>

        <TableRowGroup title="Advanced Notifications">
          <TableSwitchRow
            label="Send Notifications to Channel"
            subLabel="Send detected messages to a specific channel"
            value={storage.sendNotificationToChannel}
            onValueChange={(v: boolean) => { storage.sendNotificationToChannel = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Send Notifications to Webhook"
            subLabel="Send detected messages to a webhook"
            value={storage.sendNotificationToWebhook}
            onValueChange={(v: boolean) => { storage.sendNotificationToWebhook = v; forceUpdate(); }}
          />
        </TableRowGroup>

        {storage.sendNotificationToChannel && (
          <TableRowGroup title="Target Channel ID">
            <Stack spacing={4} style={{ padding: 10 }}>
              <TextInput
                placeholder="Enter Target Channel ID..."
                value={storage.targetChannelId}
                onChange={(v: string) => { storage.targetChannelId = v; forceUpdate(); }}
              />
              <Text style={{ color: "#f23f42", fontSize: 12, marginTop: 4, fontWeight: "bold" }}>
                WARNING: You must own the target channel to maintain privacy and prevent spamming others!!
              </Text>
            </Stack>
          </TableRowGroup>
        )}

        {storage.sendNotificationToWebhook && (
          <TableRowGroup title="Webhook URL">
            <Stack spacing={4} style={{ padding: 10 }}>
              <TextInput
                placeholder="Enter Webhook URL..."
                value={storage.webhookUrl}
                onChange={(v: string) => { storage.webhookUrl = v; forceUpdate(); }}
              />
            </Stack>
          </TableRowGroup>
        )}

      </Stack>
    </ScrollView>
  );
}
