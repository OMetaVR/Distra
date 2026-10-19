// Who's Typing: the "X is typing..." line above the chat input.
//
// Discord builds the line as markdown text (useTypingText): up to three typers are bold name nodes in a Text,
// e.g. [<bold "Alice">, " and ", <bold "Bob">, " are typing..."]; more is plain "Several people are typing...".
// The line's component isn't exported,
// so the TypingIndicator's TransitionItem renderItem is wrapped: the element it makes for the line gets
// a wrapper type that calls the original and rewrites the bold name nodes in what it rendered.

import { cloneElement, createElement, isValidElement } from "react";
import { View } from "react-native";

import { findByProps, findByStoreName, findByStoreNameLazy } from "@/metro";
import { useStateFromStores } from "@/metro/common";
import { Text } from "@/ui/components";

import { settings } from "./settings";
import { displayName, openProfile, roleColorOf } from "./typing";

const UserStore = findByStoreNameLazy("UserStore");
const GuildMemberStore = findByStoreNameLazy("GuildMemberStore");

/** Markdown bold nodes are keyed ".tag-N" by Discord's parser. */
const isName = (node: any) => isValidElement(node) && typeof node.key === "string" && node.key.startsWith(".tag-");

/** One typing user's name, drawn over Discord's own bold node: avatar, role colour, tap for the profile. */
function TypingName({ node, userId, guildId, channelId }: { node: any; userId: string; guildId?: string | null; channelId: string }) {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(userId));
    const color = useStateFromStores([GuildMemberStore], () => settings.showRoleColors ? roleColorOf(userId, guildId) : undefined, [userId, guildId]);
    const hub = findByProps("Avatar", "AvatarSizes");
    const Avatar = hub?.Avatar;

    const children = [
        settings.showAvatars && user && Avatar ? (
            <View key="avatar" style={{ width: 18, height: 16, paddingRight: 2 }}>
                <Avatar user={user} guildId={guildId ?? undefined} size="size16" />
            </View>
        ) : null,
        node.props.children,
    ];
    return cloneElement(node, {
        style: color ? [node.props.style, { color }] : node.props.style,
        onPress: settings.tappableNames ? () => openProfile(userId, guildId, channelId) : node.props.onPress,
        children,
    });
}

const isEnglish = () => String(findByStoreName("LocaleStore")?.locale ?? "en").toLowerCase().startsWith("en");

/** A bold name like Discord's own, for text Discord rendered without name nodes. */
const boldName = (userId: string, guildId?: string | null) => (
    <Text variant="text-xs/semibold" color="interactive-text-default">{displayName(userId, guildId)}</Text>
);

/** Rewrites the name nodes in a Text's children; undefined when this isn't the line's Text. */
function rewriteChildren(children: any[], ids: string[], guildId: string | null | undefined, channelId: string): any[] | undefined {
    const names = children.filter(isName);
    if (names.length !== ids.length) return undefined;

    let index = 0;
    return children.map(child => {
        if (!isName(child)) return child;
        const id = ids[index++];
        return <TypingName key={`${child.key}:${id}`} node={child} userId={id} guildId={guildId} channelId={channelId} />;
    });
}

/**
 * Past three typers Discord shows plain "Several people are typing...". The better text names two of them
 * and counts the rest. English only: the sentence is built here, not by Discord's translations.
 */
function severalChildren(ids: string[], guildId: string | null | undefined, channelId: string): any[] {
    const others = ids.length - 2;
    const person = (id: string) => <TypingName key={id} node={boldName(id, guildId)} userId={id} guildId={guildId} channelId={channelId} />;
    return [person(ids[0]), ", ", person(ids[1]), ` and ${others} others are typing...`];
}

function rewrite(node: any, ids: string[], guildId: string | null | undefined, channelId: string, depth = 0): any {
    if (!node || typeof node !== "object" || depth > 12) return node;
    if (Array.isArray(node)) {
        let changed = false;
        const next = node.map(child => {
            const result = rewrite(child, ids, guildId, channelId, depth + 1);
            changed ||= result !== child;
            return result;
        });
        return changed ? next : node;
    }
    const children = node.props?.children;
    if (Array.isArray(children) && children.some(isName)) {
        const next = rewriteChildren(children, ids, guildId, channelId);
        return next ? cloneElement(node, { children: next }) : node;
    }
    if (typeof children === "string" && ids.length > 3 && settings.alternativeFormatting && isEnglish() && /typing/i.test(children)) {
        return cloneElement(node, { children: severalChildren(ids, guildId, channelId) });
    }
    const next = rewrite(children, ids, guildId, channelId, depth + 1);
    return next === children ? node : cloneElement(node, { children: next });
}

const wrappers = new WeakMap<object, any>();

/** A type that renders `Line` and then applies the rewrite, so the line keeps its own hooks and animation. */
function wrapperFor(Line: (props: any) => any) {
    let Wrapper = wrappers.get(Line);
    if (!Wrapper) {
        Wrapper = function WhosTypingLine(props: any) {
            const rendered = Line(props);
            try {
                const ids = (props.typingUserIds as string[] | undefined)?.filter(id => UserStore.getUser(id));
                if (!ids?.length) return rendered;
                return rewrite(rendered, ids, props.channel?.guild_id, props.channel?.id);
            } catch {
                return rendered;
            }
        };
        wrappers.set(Line, Wrapper);
    }
    return Wrapper;
}

const renderers = new WeakMap<object, any>();
const WRAPPED = Symbol.for("distra.whosTyping.line");

/**
 * For the TypingIndicator's element: a copy whose renderItem makes the wrapped line. Cached per
 * renderItem so the TransitionItem gets the same function on every render.
 */
export function withTweakedLine(element: any) {
    const renderItem = element?.props?.renderItem;
    if (typeof renderItem !== "function" || renderItem[WRAPPED]) return element;
    let wrapped = renderers.get(renderItem);
    if (!wrapped) {
        wrapped = (...args: any[]) => {
            const line = renderItem(...args);
            if (!isValidElement(line) || typeof line.type !== "function" || !(line.props as any)?.typingUserIds) return line;
            return createElement(wrapperFor(line.type as any), { ...(line.props as object), key: line.key } as any);
        };
        wrapped[WRAPPED] = true;
        renderers.set(renderItem, wrapped);
    }
    return cloneElement(element, { renderItem: wrapped });
}
