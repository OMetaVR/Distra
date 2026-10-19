// Who's Typing: typing indicators in the channel lists.
//
//   - server channels (channel_list_v2 TextChannel / ThreadChannel rows): a small badge is added next to
//     the row's trailing info (unread / mention badges). Discord has no typing indicator there;
//   - DMs (Messages tab rows): Discord only animates the avatar's status dot. While someone types, the row's
//     last-message preview (ChannelRowPreview) is replaced by the dots and "X is typing...".
//
// Each badge subscribes to the TypingStore itself, so a typing event re-renders only the rows involved.

import { cloneElement } from "react";

import { afterComponentRender } from "@/lib/components";
import type { Patcher } from "@/lib/patcher";
import { findByFilePath } from "@/metro";

import { ChannelTypingBadge, DmTypingPreview } from "./components";
import { settings } from "./settings";

const FILES = {
    text: "modules/channel_list_v2/native/items/TextChannel.tsx",
    thread: "modules/channel_list_v2/native/items/ThreadChannel.tsx",
    dmPreview: "modules/main_tabs_v2/native/shared_components/ChannelRowPreview.tsx",
};

function typeName(type: any): string {
    if (!type) return "";
    return type.displayName || type.name || type.type?.displayName || type.type?.name || type.render?.name || "";
}

/** Inserts `badge` before the row's trailing ChannelInfo; undefined if the row has none. */
function insertBeforeInfo(node: any, badge: any, depth = 0): any {
    if (!node || typeof node !== "object" || depth > 14) return undefined;
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            const next = insertBeforeInfo(node[i], badge, depth + 1);
            if (next) return Object.assign(node.slice(), { [i]: next });
        }
        return undefined;
    }
    const children = node.props?.children;
    if (Array.isArray(children)) {
        const at = children.findIndex(child => child && typeof child === "object" && typeName(child.type) === "ChannelInfo");
        if (at >= 0) return cloneElement(node, { children: [...children.slice(0, at), badge, ...children.slice(at)] });
    }
    const next = insertBeforeInfo(children, badge, depth + 1);
    return next ? cloneElement(node, { children: next }) : undefined;
}

export function patchChannelRows(patcher: Patcher): string[] {
    const failed: string[] = [];
    for (const path of [FILES.text, FILES.thread]) {
        try {
            const ok = afterComponentRender(patcher, path, (props, element) => {
                const channel = props?.channel;
                if (!settings.serverChannels || !channel?.id) return;
                const badge = <ChannelTypingBadge key="whos-typing" channelId={channel.id} guildId={channel.guild_id} muted={props.muted} />;
                return insertBeforeInfo(element, badge);
            });
            if (!ok) failed.push(path);
        } catch (e) {
            failed.push(`${path} (${e})`);
        }
    }
    return failed;
}

export function patchDmRows(patcher: Patcher): boolean {
    const exports = findByFilePath(FILES.dmPreview, false);
    if (typeof exports?.ChannelRowPreview !== "function") return false;
    patcher.after("ChannelRowPreview", exports, ([props]: any[], element: any) => {
        const channel = props?.channel;
        if (!settings.dmList || !channel?.id || channel.guild_id) return;
        return <DmTypingPreview channelId={channel.id} muted={props.muted} original={element} />;
    });
    return true;
}
