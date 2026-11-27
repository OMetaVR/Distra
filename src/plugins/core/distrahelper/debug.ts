// Debug info for support: Distra and Discord builds, iOS version and enabled plugins. Sent as normal
// messages, only after the user confirms.

import { Alert, Platform } from "react-native";

import { loader } from "@/core/loader";
import { messageUtil } from "@/metro/common";
import { builtins, plugins } from "@/plugins/manager";

import { buildDate } from "./shared";

export function debugInfo() {
    const records = [...Object.values(builtins), ...Object.values(plugins)].filter(record => record.enabled);
    const names = records.map(record => record.manifest.name).sort((a, b) => a.localeCompare(b));
    const own = records.filter(record => record.builtin?.core).map(record => record.manifest.name).sort();
    const constants: any = (Platform as any).constants ?? {};
    const info = [
        `**Distra**: v${DISTRA_VERSION} • ${DISTRA_COMMIT.slice(0, 7)} • built ${buildDate()}`,
        `**Tweak**: v${loader.version}${loader.jailbroken ? " (jailbroken)" : " (IPA)"} • JS from ${loader.bundle.source === "embedded" ? "the tweak" : "a custom URL"}`,
        `**Discord**: iOS ${loader.discord.version} (${loader.discord.build})`,
        `**Platform**: ${constants.systemName ?? "iOS"} ${Platform.Version}${constants.interfaceIdiom ? ` (${constants.interfaceIdiom})` : ""}`,
        `**Enabled plugins**: ${names.length}${own.length ? ` (Distra: ${own.join(", ")})` : ""}`,
    ];
    return { summary: `>>> ${info.join("\n")}`, pluginList: names.join(", ") };
}

/** Sends the debug info (summary, then the plugin list in chunks under Discord's 2000 character limit). */
export function sendDebugInfo(channelId: string) {
    const { summary, pluginList } = debugInfo();
    messageUtil.sendMessage(channelId, { content: summary });
    for (let i = 0; i < pluginList.length; i += 1900) {
        messageUtil.sendMessage(channelId, { content: "```\n" + pluginList.slice(i, i + 1900) + "\n```" });
    }
}

export function confirmSendDebugInfo(channelId: string) {
    Alert.alert(
        "Send your debug info?",
        "This posts your Distra version, Discord build, iOS version and the names of your enabled plugins in this chat.",
        [{ text: "Cancel", style: "cancel" }, { text: "Send", onPress: () => sendDebugInfo(channelId) }],
    );
}
