// Keeps plugins that hook the removed `DCDChatManager.updateRows` working: Discord now sends chat
// rows through the DCDChat native component's `updateRows` command, with the same arguments
// (view, rows JSON, ...). Those calls are routed through `chatManagerShim`, so patches on it see
// and can rewrite the rows. See core/native.ts for the `DCDChatManager` alias itself.

import { chatManagerShim, setChatUpdateRows } from "@/core/native";
import { logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { confirm } from "@/ui/alerts";
import { unwrapLazy } from "@/lib/lazy";
import { findByProps, waitFor } from "@/metro";
import * as common from "@/metro/common";
import { fromPredicate } from "@/metro/filters";

const isChatComponent = fromPredicate(m =>
    typeof m?.Commands?.updateRows === "function" && typeof m.Commands.clearRows === "function" && m.__INTERNAL_VIEW_CONFIG != null,
"chatNativeComponent");

export function patchChatCommands() {
    waitFor(isChatComponent, ({ Commands }) => {
        const original = Commands.updateRows;
        setChatUpdateRows((...args: unknown[]) => original.apply(Commands, args));
        corePatcher.instead("updateRows", Commands, (args: unknown[]) => chatManagerShim.updateRows(...args));
        logger.debug("Routed chat updateRows through DCDChatManager shim");
    });
}

const DISCORD_LINK = /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com(\/channels\/[^?#]+)/i;
/**
 * Tapping an invite opens the other Discord app if we hand it to iOS. Ask whether to join it
 * here instead, naming the server when Discord can resolve the invite.
 */
async function openInvite(code: string) {
    const invites = findByProps("acceptInviteAndTransitionToInviteChannel", "resolveInvite");
    if (!invites) return;
    let name = `discord.gg/${code}`;
    try {
        const resolved = await invites.resolveInvite(code);
        name = resolved?.invite?.guild?.name ?? resolved?.invite?.channel?.name ?? name;
    } catch { }
    const join = await confirm({ title: `Join ${name}?`, message: `discord.gg/${code}`, confirmText: "Join" });
    if (join) invites.acceptInviteAndTransitionToInviteChannel({ inviteKey: code, context: { location: "Distra" } });
}

const INVITE_LINK = /^https?:\/\/(?:discord\.gg|(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/invite)\/([\w-]+)/i;

/**
 * Plugins open message links with `Linking.openURL`. On iOS that hands discord.com links to
 * whichever app claims them, often another Discord install; navigate in this one instead.
 */
export function patchDiscordLinks() {
    const Linking = unwrapLazy(common.ReactNative).Linking;
    const router = findByProps("transitionToGuild", "transitionTo");
    if (!Linking || !router) return logger.warn("Could not keep discord.com links in the app");
    corePatcher.instead("openURL", Linking, (args: any[], original: (...args: any[]) => any) => {
        const target = typeof args[0] === "string" ? args[0] : "";
        const invite = target.match(INVITE_LINK)?.[1];
        const path = target.match(DISCORD_LINK)?.[1];
        if (invite) {
            void openInvite(invite);
            return Promise.resolve(true);
        }
        if (!path) return original(...args);
        router.transitionTo(path);
        return Promise.resolve(true);
    });
}
