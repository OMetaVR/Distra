// Role Color Everywhere: shows people's top role color where Discord leaves names plain.
// Ported from Vencord's RoleColorEverywhere (KingFish, lewisakura, AutumnVN, Kyuuhachi, jamesbt365).
//  - Chat rows (RowManager#generate): user mentions get the mentioned member's color, the way
//    role mentions are drawn; optionally message text is tinted with the author's color.
//  - Member list: role section headers ("Moderators — 3") in the role's color.
//  - Voice users under voice channels, and the reactions sheet's user list.
// Discord already colors authors, reply authors and member list rows itself.
// `api.roleColor(userId, guildId)` is the color other plugins can use (e.g. a typing indicator).

import { createContext, useContext } from "react";

import { afterComponentRender } from "@/lib/components";
import { mapNodes, MESSAGE_ROW, RowManager } from "@/lib/chatRows";
import { Logger } from "@/lib/logger";
import { createPatcher } from "@/lib/patcher";
import { findByFilePath, findByStoreNameLazy } from "@/metro";

import { definePlugin } from "../types";
import { renderTargetOf, replaceElement, withColor } from "./elements";
import SettingsPage from "./SettingsPage";
import { loadSettings, settings } from "./settings";

const logger = new Logger("RoleColorEverywhere");
const GuildMemberStore = findByStoreNameLazy("GuildMemberStore");
const GuildRoleStore = findByStoreNameLazy("GuildRoleStore");
const ChannelStore = findByStoreNameLazy("ChannelStore");
const SelectedChannelStore = findByStoreNameLazy("SelectedChannelStore");

const FILES = {
    memberList: "modules/main_tabs_v2/native/shared_components/user_list/GuildChannelUserList.tsx",
    voiceUserName: "modules/guild_sidebar/native/VoiceUserNameItem.tsx",
    reactions: "modules/reactions/native/MessageReactionsContent.tsx",
    discordTag: "modules/user_profile/native/DiscordTag.tsx",
};

function guildOf(channelOrGuildId?: string | null): string | undefined {
    if (!channelOrGuildId) return undefined;
    const channel = ChannelStore.getChannel?.(channelOrGuildId);
    return channel ? channel.guild_id ?? undefined : channelOrGuildId;
}

/** The member's role color as "#rrggbb", or null. Accepts a guild id or a channel id. */
export function roleColor(userId?: string | null, channelOrGuildId?: string | null): string | null {
    const guildId = guildOf(channelOrGuildId);
    if (!userId || !guildId) return null;
    return GuildMemberStore.getMember?.(guildId, userId)?.colorString ?? null;
}

const toInt = (hex?: string | null) => hex ? parseInt(hex.slice(1), 16) : null;

/** A user mention node colored like Discord colors role mentions. */
function coloredMention(node: any, guildId: string) {
    if (!node.userId || node.roleId || node.roleColor != null) return undefined;
    const member = GuildMemberStore.getMember?.(node.guildId ?? guildId, node.userId);
    const hex: string | undefined = member?.colorString;
    if (!hex) return undefined;
    const strings = member.colorStrings;
    return {
        ...node,
        roleColor: toInt(hex),
        roleColors: { primaryColor: toInt(strings?.primaryColor ?? hex), secondaryColor: toInt(strings?.secondaryColor), tertiaryColor: toInt(strings?.tertiaryColor) },
        color: toInt(hex),
        colorString: hex,
    };
}

const colorMentions = (content: any[], guildId: string) =>
    mapNodes(content, node => node.type === "mention" ? coloredMention(node, guildId) : undefined);

/** Mixes `amount` (0-1) of `hex` into a native ARGB color. */
function mixColor(argb: number, hex: string, amount: number) {
    const role = parseInt(hex.slice(1), 16);
    const channel = (shift: number) => Math.round(((argb >>> shift) & 255) * (1 - amount) + ((role >>> shift) & 255) * amount);
    return ((((argb >>> 24) & 255) << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)) >>> 0;
}

function patchRows(patcher: ReturnType<typeof createPatcher>) {
    patcher.after("generate", RowManager.prototype, ([data]: any[], row: any) => {
        if (data?.rowType !== MESSAGE_ROW || !row?.message) return;
        const message = row.message;
        const guildId = message.guildId ?? guildOf(message.channelId);
        if (!guildId) return;

        if (settings.chatMentions) {
            if (Array.isArray(message.content)) message.content = colorMentions(message.content, guildId);
            const reply = message.referencedMessage?.message;
            if (Array.isArray(reply?.content)) reply.content = colorMentions(reply.content, guildId);
        }
        if (settings.colorChatMessages && settings.messageSaturation > 0 && typeof message.textColor === "number") {
            const hex = roleColor(message.authorId, guildId);
            if (hex) message.textColor = mixColor(message.textColor, hex, Math.min(settings.messageSaturation, 100) / 100);
        }
    });
}

/** The guild's colored roles by name, for matching member list section titles. */
function rolesByName(guildId: string): Map<string, any> {
    const roles: any[] = Object.values(GuildRoleStore.getRolesSnapshot?.(guildId) ?? GuildRoleStore.getSortedRoles?.(guildId) ?? {});
    const byName = new Map<string, any>();
    for (const role of roles.sort((a, b) => (b.position ?? 0) - (a.position ?? 0))) {
        if (role?.colorString && !byName.has(role.name)) byName.set(role.name, role);
    }
    return byName;
}

// Same section-props function in, same wrapper out, so the list doesn't re-render for nothing.
const sectionWrappers = new WeakMap<(...args: any[]) => any, { guildId: string; wrapped: (...args: any[]) => any }>();
function colorSections(getSectionProps: (...args: any[]) => any, guildId: string) {
    const cached = sectionWrappers.get(getSectionProps);
    if (cached?.guildId === guildId) return cached.wrapped;
    const wrapped = (...args: any[]) => {
        const result = getSectionProps(...args);
        const title = result?.props?.title;
        if (!settings.memberList || typeof title !== "string" || result.props.colorOverride) return result;
        const role = rolesByName(guildId).get(title.replace(/ — [\d,.\s]+$/, ""));
        return role ? { ...result, props: { ...result.props, colorOverride: role.colorString } } : result;
    };
    sectionWrappers.set(getSectionProps, { guildId, wrapped });
    return wrapped;
}

/** Where to patch a module's exported component (`exports[key]` itself when it is a plain function). */
function componentTarget(exports: any, key: string): [any, string] | undefined {
    const component = exports?.[key];
    return renderTargetOf(component) ?? (typeof component === "function" ? [exports, key] : undefined);
}

/** The names a member list or voice row may show for this user. */
function namesOf(user: any, guildId?: string, member?: any): string[] {
    return [member?.nick, guildId && user?.id && GuildMemberStore.getNick?.(guildId, user.id), user?.globalName, user?.global_name, user?.username]
        .filter((name): name is string => typeof name === "string" && name.length > 0);
}

// Set around the reactions sheet: DiscordTag, which draws its names, also appears on profiles.
let reactionsContext: React.Context<string | null> | undefined;
const ReactionsContext = () => reactionsContext ??= createContext<string | null>(null);

let patcher = createPatcher("RoleColorEverywhere");
let running = false;

export default definePlugin({
    id: "distra:role-color-everywhere",
    manifest: {
        name: "Role Color Everywhere",
        description: "Shows people's role colors on mentions, member list role headers, voice users and the reactions list, and can tint message text with the author's color.",
        authors: [{ name: "Distra" }, { name: "KingFish" }, { name: "lewisakura" }, { name: "AutumnVN" }, { name: "Kyuuhachi" }, { name: "jamesbt365" }],
        version: "1.0.0",
    },

    async start() {
        await loadSettings();
        patcher = createPatcher("RoleColorEverywhere");
        running = true;
        patchRows(patcher);

        const results: Record<string, boolean> = {
            memberList: afterComponentRender(patcher, FILES.memberList, (props, element) => {
                if (!settings.memberList) return;
                const guildId = props?.guildId ?? guildOf(props?.channel?.id ?? props?.channelId ?? SelectedChannelStore.getChannelId?.());
                if (!guildId) return;
                return replaceElement(
                    element,
                    node => typeof node.props?.getSectionProps === "function" && node.props.sections != null,
                    node => ({ ...node, props: { ...node.props, getSectionProps: colorSections(node.props.getSectionProps, guildId) } }),
                );
            }),
            voiceUsers: afterComponentRender(patcher, FILES.voiceUserName, (props, element) => {
                if (!settings.voiceUsers || !props?.user) return;
                const color = props.member?.colorString ?? roleColor(props.user.id, props.guildId);
                if (!color) return;
                const names = namesOf(props.user, props.guildId, props.member);
                return replaceElement(element, node => typeof node.props?.children === "string" && names.includes(node.props.children), node => withColor(node, color));
            }),
        };

        const reactions = findByFilePath(FILES.reactions);
        const reactionsTarget = componentTarget(reactions, reactions?.default ? "default" : "MessageReactionsContent");
        const discordTagTarget = componentTarget(findByFilePath(FILES.discordTag), "default");
        results.reactorsList = !!(reactionsTarget && discordTagTarget);
        if (reactionsTarget && discordTagTarget) {
            patcher.after(reactionsTarget[1], reactionsTarget[0], ([props]: any[], element: any) => {
                if (!element) return;
                const channelId = props?.channelId ?? props?.message?.channel_id ?? SelectedChannelStore.getChannelId?.();
                const { Provider } = ReactionsContext();
                return <Provider value={guildOf(channelId) ?? null}>{element}</Provider>;
            });
            patcher.before(discordTagTarget[1], discordTagTarget[0], (args: any[]) => {
                const guildId = useContext(ReactionsContext());
                const props = args[0];
                if (!running || !guildId || !settings.reactorsList || !props?.user?.id) return;
                const color = roleColor(props.user.id, guildId);
                if (!color) return;
                return [{
                    ...props,
                    nicknameStyle: [props.nicknameStyle, { color }],
                    usernameStyle: props.nick ? props.usernameStyle : [props.usernameStyle, { color }],
                }, ...args.slice(1)];
            });
        }

        const missing = Object.entries(results).filter(([, ok]) => !ok).map(([name]) => name);
        if (missing.length) logger.warn(`Could not hook: ${missing.join(", ")}`);
    },

    stop() {
        running = false;
        patcher.unpatchAll();
    },

    SettingsComponent: SettingsPage,

    api: { roleColor },
});
