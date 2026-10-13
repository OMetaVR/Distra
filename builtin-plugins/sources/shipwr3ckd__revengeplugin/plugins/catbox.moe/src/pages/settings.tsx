import { React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { findByProps } from "@vendetta/metro";

const { ScrollView } = findByProps("ScrollView");
const {
  TableRowGroup,
  TableSwitchRow,
  Stack,
} = findByProps("TableSwitchRow", "TableRowGroup", "Stack");

const { TextInput } = findByProps("TextInput");

const get = (k: string, fallback: any = "") => storage[k] ?? fallback;
const set = (k: string, v: any) => (storage[k] = v);

export default function Settings() {
  const [_, forceUpdate] = React.useReducer(x => ~x, 0);
  const update = () => forceUpdate();

  const selectedHost = get("selectedHost", "catbox");
  const setHost = (host: string) => {
    set("selectedHost", host);
    update();
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <Stack spacing={8} style={{ padding: 10 }}>

        <TableRowGroup title="Upload Settings">
          <TableSwitchRow
            label="Always upload to file hosters"
            subLabel="Ignore the 10MBs file size limit to trigger upload"
            value={!!get("alwaysUpload")}
            onValueChange={(v) => {
              set("alwaysUpload", v);
              update();
            }}
          />
          <TableSwitchRow
            label="Copy link to clipboard"
            subLabel="Disable to automatically send link to chat"
            value={!!get("copy")}
            onValueChange={(v) => {
              set("copy", v);
              update();
            }}
          />
          <TableSwitchRow
            label="Insert into the message"
            subLabel="Directly inserts the link at the end of the next message"
            value={!!get("insert")}
            onValueChange={(v) => {
              set("insert", v);
              update();
            }}
          />
        </TableRowGroup>

        <TableRowGroup title="Default File Hoster">
          <TableSwitchRow
            label="Catbox"
            subLabel="https://catbox.moe/"
            value={selectedHost === "catbox"}
            onValueChange={() => setHost("catbox")}
          />
          <TableSwitchRow
            label="Litterbox"
            subLabel="https://litterbox.catbox.moe/"
            value={selectedHost === "litterbox"}
            onValueChange={() => setHost("litterbox")}
          />
          <TableSwitchRow
            label="Pomf"
            subLabel="https://pomf.lain.la/"
            value={selectedHost === "pomf"}
            onValueChange={() => setHost("pomf")}
          />
        </TableRowGroup>

        <TableRowGroup title="Litterbox default duration(hours)">
          <Stack spacing={4}>
            <TextInput
              placeholder="e.g. 24"
              value={get("defaultDuration")}
              onChange={(v) => {
                set("defaultDuration", v);
                update();
              }}
              isClearable
            />
          </Stack>
        </TableRowGroup>

        <TableRowGroup title="Litterbox Custom Command Name">
          <Stack spacing={4}>
            <TextInput
              placeholder="e.g. /litterbox"
              value={get("commandName")}
              onChange={(v) => {
                set("commandName", v);
                update();
              }}
              isClearable
            />
          </Stack>
        </TableRowGroup>

        <TableRowGroup title="Proxy Settings">
          <TableSwitchRow
            label="Use Proxy Server"
            value={!!get("useProxy")}
            onValueChange={(v) => {
              set("useProxy", v);
              update();
            }}
          />
          <TableSwitchRow
            label="Reverse proxied link"
            value={!!get("revProxy")}
            onValueChange={(v) => {
              set("revProxy", v);
              update();
            }}
          />
        </TableRowGroup>

        <TableRowGroup title="Proxy Base URL">
          <Stack spacing={4}>
            <TextInput
              placeholder="https://your-proxy.com"
              value={get("proxyBaseUrl")}
              onChange={(v) => {
                const cleaned = v.replace(/\/+$/, "");
                set("proxyBaseUrl", cleaned);
                update();
              }}
              isClearable
            />
          </Stack>
        </TableRowGroup>

        <TableRowGroup title="Catbox Userhash">
          <Stack spacing={4}>
            <TextInput
              placeholder="Userhash"
              value={get("userhash")}
              onChange={(v) => {
                set("userhash", v);
                update();
              }}
              isClearable
            />
          </Stack>
        </TableRowGroup>

      </Stack>
    </ScrollView>
  );
}