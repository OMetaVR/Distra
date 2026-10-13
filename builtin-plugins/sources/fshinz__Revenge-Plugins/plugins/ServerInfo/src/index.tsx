import { find, findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import ServerInfoView from "./components/ServerInfoView";

const { openLazy } = findByProps("openLazy") ?? {};
const GuildActions = findByProps("requestMembersById");
const RelStore = findByStoreName("RelationshipStore");
const MemberStore = findByStoreName("GuildMemberStore");
const UserStore = findByStoreName("UserStore");
const SelectedGuildStore = findByStoreName("SelectedGuildStore");

export async function getGuildFriends(targetGuildId?: string, timeoutMs: number = 1500) {
    const guildId = targetGuildId ?? SelectedGuildStore?.getGuildId?.();
    if (!guildId) return [];

    const friendIds = RelStore?.getFriendIDs?.() ?? [];
    if (!friendIds.length) return [];

    if (GuildActions?.requestMembersById) {
        GuildActions.requestMembersById(guildId, friendIds);
    }

    await new Promise<void>((resolve) => {
        let timer: any;

        const handleChunk = (data: any) => {
            if (data?.guildId === guildId || data?.guild_id === guildId) {
                cleanup();
                resolve();
            }
        };

        const cleanup = () => {
            clearTimeout(timer);
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK", handleChunk);
        };

        FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK", handleChunk);

        timer = setTimeout(() => {
            cleanup();
            resolve();
        }, timeoutMs);
    });

    const guildMembers = MemberStore?.getMembers?.(guildId) ?? {};

    return friendIds.map((id: string) => {
        const member = guildMembers[id] ?? MemberStore?.getMember?.(guildId, id);
        if (!member) return null;

        const user = UserStore?.getUser?.(id);
        return {
            id,
            username: user?.username ?? null,
            globalName: user?.globalName ?? null,
            nick: member?.nick ?? null,
        };
    }).filter(Boolean);
}

let unpatch: (() => void) | undefined;

function patchGuildMenu(): () => void {
    const mod = find((m: any) => m?.default?.name === "getGuildsBarGuildMenuItems");
    if (!mod?.default || !openLazy) return () => {};

    return after("default", mod, (args: any[], ret: any) => {
        const guildId = args?.[0];
        if (!guildId || !Array.isArray(ret)) return ret;

        const id = String(guildId);

        const serverInfoItem = {
            label: "Server Info",
            action: () => {
                openLazy(
                    Promise.resolve({ default: ServerInfoView }),
                    "server-info-actionsheet-" + id,
                    { guildId: id }
                );
            },
        };

        return [...ret, serverInfoItem];
    });
}

export default {
    onLoad: () => {
        try {
            unpatch = patchGuildMenu();
        } catch (error) {
            console.error("[ServerInfo] Failed to apply guildMenu patch:", error);
        }
    },
    onUnload: () => {
        try {
            unpatch?.();
        } catch {
            /* ignore */
        }
        unpatch = undefined;
    },
};
