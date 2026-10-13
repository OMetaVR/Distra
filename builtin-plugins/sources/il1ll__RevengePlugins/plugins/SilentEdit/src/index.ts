import { findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { after, before, instead } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";
import Settings from "./settings";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const RestAPI = findByProps("get", "post", "del", "patch");
const MessageActions = findByProps("editMessage");
const UserStore = findByProps("getCurrentUser");
const { ActionSheetRow } = findByProps("ActionSheetRow");

const EditIcon = getAssetIDByName("PencilIcon");

let unpatchActionSheet: (() => void) | null = null;
let unpatchEditMessage: (() => void) | null = null;
let pendingSilentEditMessageId: string | null = null;

export default {
    onLoad() {
        if (storage.overrideNative === undefined) {
            storage.overrideNative = true;
        }

        unpatchEditMessage = instead("editMessage", MessageActions, async (args, orig) => {
            const [channelId, messageId, reqData] = args;

            if (!storage.overrideNative && pendingSilentEditMessageId !== messageId) {
                return orig(...args);
            }

            pendingSilentEditMessageId = null;

            try {
                const originalMessage = await RestAPI.get({
                    url: `/channels/${channelId}/messages`,
                    query: { limit: 1, around: messageId },
                });

                const msgArray = originalMessage?.body;
                if (!msgArray || !msgArray.length) return orig(...args);

                const msg = msgArray.find((m: any) => m.id === messageId);
                if (!msg) return orig(...args);

                let content = reqData.content;
                const regex = /\.filename\s+(\S+)/g;
                let matches = [...content.matchAll(regex)];
                let attachments;

                if (matches.length > 0) {
                    matches = matches.slice(0, 10);
                    
                    attachments = matches.map((match, index) => {
                        const uploadedFilename = match[1];
                        const filename = uploadedFilename.split("/").pop() || "image.png";
                        
                        return {
                            id: String(index),
                            filename: filename,
                            uploaded_filename: uploadedFilename
                        };
                    });
                    
                    content = content.replace(/\.filename\s+(\S+)/g, "").trim();
                }

                const body: any = {
                    content: content,
                    nonce: messageId,
                    tts: false,
                    flags: msg.flags ?? 0,
                    mobile_network_type: "wifi",
                };

                if (attachments) {
                    body.attachments = attachments;
                }

                if (msg.message_reference) {
                    body.message_reference = {
                        message_id: msg.message_reference.message_id,
                        channel_id: msg.message_reference.channel_id,
                        guild_id: msg.message_reference.guild_id,
                    };
                    
                    const repliedUser = msg.referenced_message?.author?.id;
                    const hasPing = repliedUser ? msg.mentions?.some((m: any) => m.id === repliedUser) : false;
                    
                    body.allowed_mentions = {
                        replied_user: hasPing,
                        parse: ["users", "roles", "everyone"]
                    };
                }

                const response = await RestAPI.post({
                    url: `/channels/${channelId}/messages`,
                    body,
                });

                await RestAPI.del({
                    url: `/channels/${channelId}/messages/${messageId}`
                });

                return response;
            } catch (err: any) {
                showToast("Error: " + (err?.body?.message || err?.message || String(err)));
                return orig(...args);
            }
        });

        unpatchActionSheet = before("openLazy", LazyActionSheet, ([component, key, msg]) => {
            if (storage.overrideNative) return;

            const message = msg?.message;
            if (key !== "MessageLongPressActionSheet" || !message) return;

            pendingSilentEditMessageId = null;

            const currentUser = UserStore?.getCurrentUser();
            if (!currentUser || message.author?.id !== currentUser.id) return;

            component.then((instance: any) => {
                const unpatch = after("default", instance, (_, comp) => {
                    React.useEffect(() => () => unpatch(), []);

                    const groups: any[] = findInReactTree(
                        comp,
                        (c: any) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
                    );

                    if (!groups?.length) return;

                    let editRowOnPress: any = null;
                    let targetGroupChildren: any[] | null = null;
                    let targetIndex = -1;

                    for (let gi = 0; gi < groups.length; gi++) {
                        const groupChildren: any[] = findInReactTree(
                            groups[gi],
                            (c: any) => Array.isArray(c) && c.some((child: any) =>
                                child?.type?.name === "ActionSheetRow"
                            )
                        );
                        
                        if (!groupChildren) continue;

                        const editRowIndex = groupChildren.findIndex((c: any) => {
                            const labelStr = (c?.props?.label || c?.props?.message || "").toLowerCase();
                            return labelStr.includes("edit");
                        });

                        if (editRowIndex >= 0) {
                            editRowOnPress = groupChildren[editRowIndex].props.onPress;
                            targetGroupChildren = groupChildren;
                            targetIndex = editRowIndex;
                            break;
                        }
                    }

                    if (!editRowOnPress || !targetGroupChildren) return;

                    const silentEditBtn = React.createElement(ActionSheetRow, {
                        label: "Silent Edit",
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: EditIcon,
                        }),
                        onPress: () => {
                            pendingSilentEditMessageId = message.id;
                            editRowOnPress();
                        },
                    });

                    targetGroupChildren.splice(targetIndex + 1, 0, silentEditBtn);
                });
            });
        });
    },

    onUnload() {
        if (unpatchEditMessage) unpatchEditMessage();
        if (unpatchActionSheet) unpatchActionSheet();
        unpatchEditMessage = null;
        unpatchActionSheet = null;
    },

    settings: Settings,
};
