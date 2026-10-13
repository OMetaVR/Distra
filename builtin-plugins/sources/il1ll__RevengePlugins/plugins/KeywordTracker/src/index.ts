import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";
import { React, NavigationNative } from "@vendetta/metro/common";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { after } from "@vendetta/patcher";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";
import Settings from "./settings";

const { FormSection, FormRow } = Forms;
const { TableRowIcon } = findByProps("TableRowIcon");

const FluxDispatcher = findByProps("dispatch", "subscribe");
const ChannelStore = findByProps("getChannel");
const GuildStore = findByProps("getGuild");
const UserStore = findByProps("getUser", "getCurrentUser");
const RelationshipStore = findByProps("getFriendIDs");
const RestAPI = findByProps("get", "post", "del", "patch");

const tabsNavigationRef = findByProps("getRootNavigationRef");
const settingConstants = findByProps("SETTING_RENDERER_CONFIG");
const createListModule = findByProps("createList");
const SettingsOverviewScreen = findByProps("SettingsOverviewScreen");

const defaults = {
  trackServers: true,
  trackGroups: true,
  trackDMs: true,
  exactMatch: false,
  wholeWords: true,
  caseSensitive: false,
  inSentence: true,
  sendNotificationToChannel: false,
  sendNotificationToWebhook: false,
  keywords: [],
  targetChannelId: "",
  webhookUrl: "",
  trackMode: "everyone",
  customIds: "",
  ignoreBots: true,
  trackEmbeds: false,
  trackChannelsEnabled: false,
  trackedChannelIds: "",
  ignoreServersEnabled: false,
  ignoredServerIds: "",
  ignoreChannelsEnabled: false,
  ignoredChannelIds: "",
  ignoreUsersEnabled: false,
  ignoredUserIds: "",
  showInSettings: true
};

for (const [key, value] of Object.entries(defaults)) {
  if (storage[key] === undefined) storage[key] = value;
}

let unsubMessage: (() => void) | null = null;

function Section({ tabs }) {
    const navigation = NavigationNative.useNavigation();

    return React.createElement(FormRow, {
        label: tabs.title(),
        leading: React.createElement(FormRow.Icon, { source: tabs.icon }),
        trailing: React.createElement(React.Fragment, {}, [
            tabs.trailing ? tabs.trailing() : null,
            React.createElement(FormRow.Arrow, { key: "arrow" }),
        ]),
        onPress: () => {
            const Component = tabs.page;
            navigation.navigate("VendettaCustomPage", {
                title: tabs.title(),
                render: () => React.createElement(Component),
            });
        },
    });
}

function patchPanelUI(tabs, patches) {
    try {
        patches.push(
            after(
                "default",
                findByProps("renderTitle", "sections"),
                (_, ret) => {
                    const UserSettingsOverview = findInReactTree(
                        ret.props.children,
                        (n) => n.type?.name === "UserSettingsOverview",
                    );

                    if (UserSettingsOverview) {
                        patches.push(
                            after(
                                "render",
                                UserSettingsOverview.type.prototype,
                                (_args, res) => {
                                    const sections = findInReactTree(
                                        res.props.children,
                                        (n) => n?.children?.[1]?.type === FormSection,
                                    )?.children;

                                    if (sections) {
                                        const index = sections.findIndex((c) =>
                                            ["BILLING_SETTINGS", "PREMIUM_SETTINGS"].includes(
                                                c?.props?.label,
                                            ),
                                        );

                                        sections.splice(
                                            -~index || 4,
                                            0,
                                            React.createElement(Section, { key: tabs.key, tabs }),
                                        );
                                    }
                                },
                            ),
                        );
                    }
                },
                true,
            ),
        );
    } catch (error) {}
}

function patchTabsUI(tabs, patches) {
    if (!settingConstants || !tabsNavigationRef) return;

    const row = {
        [tabs.key]: {
            type: "pressable",
            useTitle: tabs.title,
            title: tabs.title,
            icon: tabs.icon,
            IconComponent:
        tabs.icon &&
        (() => React.createElement(TableRowIcon, { source: tabs.icon })),
            usePredicate: tabs.predicate,
            useTrailing: tabs.trailing,
            onPress: () => {
                const navigation = tabsNavigationRef.getRootNavigationRef();
                const Component = tabs.page;

                navigation.navigate("VendettaCustomPage", {
                    title: tabs.title(),
                    render: () => React.createElement(Component),
                });
            },
            withArrow: true,
        },
    };

    let rendererConfigValue = settingConstants.SETTING_RENDERER_CONFIG;

    Object.defineProperty(settingConstants, "SETTING_RENDERER_CONFIG", {
        enumerable: true,
        configurable: true,
        get: () => ({
            ...rendererConfigValue,
            ...row,
        }),
        set: (v) => (rendererConfigValue = v),
    });

    const firstRender = Symbol("pinToSettings");

    try {
        if (!createListModule) return;
        patches.push(
            after("createList", createListModule, function (args, ret) {
                if (!args[0][firstRender]) {
                    args[0][firstRender] = true;

                    const [config] = args;
                    const sections = config.sections;

                    const section = sections?.find((x: any) =>
                        ["Bunny", "Revenge", "Kettu", "Vencore", "ShiggyCord"].some(
                            (mod) => x.label === mod && x.title === mod,
                        ),
                    );

                    if (section?.settings) {
                        section.settings = [...section.settings, tabs.key];
                    }
                }
            }),
        );
    } catch {
        if (!SettingsOverviewScreen) return;
        patches.push(
            after("default", SettingsOverviewScreen, (args, ret) => {
                if (!args[0][firstRender]) {
                    args[0][firstRender] = true;

                    const { sections } = findInReactTree(
                        ret,
                        (i) => i.props?.sections,
                    ).props;
                    const section = sections?.find((x: any) =>
                        ["Bunny", "Revenge", "Kettu", "Vencore", "ShiggyCord"].some(
                            (mod) => x.label === mod && x.title === mod,
                        ),
                    );

                    if (section?.settings) {
                        section.settings = [...section.settings, tabs.key];
                    }
                }
            }),
        );
    }
}

function patchSettingsPin(tabs) {
    const patches = [];

    let disabled = false;

    const realPredicate = tabs.predicate || (() => true);
    tabs.predicate = () => (disabled ? false : realPredicate());

    patchPanelUI(tabs, patches);
    patchTabsUI(tabs, patches);
    patches.push(() => (disabled = true));

    return () => {
        for (const x of patches) {
            x();
        }
    };
}

let unpatchSidebar: (() => void) | null = null;

function updateSidebar() {
    if (storage.showInSettings) {
        if (!unpatchSidebar) {
            try {
                unpatchSidebar = patchSettingsPin({
                    key: "keywordtracker",
                    icon: getAssetIDByName("ChatCheckIcon"),
                    title: () => "Keyword Tracker",
                    predicate: () => storage.showInSettings === true,
                    page: Settings,
                });
            } catch (error) {}
        }
    } else {
        if (unpatchSidebar) {
            unpatchSidebar();
            unpatchSidebar = null;
        }
    }
}

export default {
  onLoad() {
    updateSidebar();

    const onMessage = (p: any) => {
      const m = p?.message;
      if (!m || !storage.keywords || storage.keywords.length === 0) return;

      let fullContent = m.content || "";

      if (storage.trackEmbeds && m.embeds && Array.isArray(m.embeds)) {
        for (const embed of m.embeds) {
          if (embed.title) fullContent += " " + embed.title;
          if (embed.description) fullContent += " " + embed.description;
          if (embed.fields && Array.isArray(embed.fields)) {
            for (const f of embed.fields) {
              if (f.name) fullContent += " " + f.name;
              if (f.value) fullContent += " " + f.value;
            }
          }
        }
      }

      if (!fullContent) return;

      const currentUser = UserStore.getCurrentUser();
      if (m.author?.id === currentUser?.id) return;

      if (storage.ignoreBots && m.author?.bot) return;

      const authorId = m.author?.id;

      if (storage.ignoreUsersEnabled && storage.ignoredUserIds) {
        const ignoredUsersList = storage.ignoredUserIds.split(",").map((id: string) => id.trim());
        if (ignoredUsersList.includes(authorId)) return;
      }
      
      if (storage.trackMode === "friends") {
        const friends = RelationshipStore.getFriendIDs();
        if (!friends.includes(authorId)) return;
      } else if (storage.trackMode === "custom") {
        const customList = storage.customIds.split(",").map((id: string) => id.trim());
        if (!customList.includes(authorId)) return;
      }

      const c = ChannelStore.getChannel(m.channel_id);
      if (!c) return;

      if (storage.ignoreChannelsEnabled && storage.ignoredChannelIds) {
        const ignoredChannelsList = storage.ignoredChannelIds.split(",").map((id: string) => id.trim());
        if (ignoredChannelsList.includes(c.id)) return;
      }

      let isTrackedChannel = false;
      if (storage.trackChannelsEnabled && storage.trackedChannelIds) {
        const trackedChannelsList = storage.trackedChannelIds.split(",").map((id: string) => id.trim());
        if (trackedChannelsList.includes(c.id)) isTrackedChannel = true;
      }

      if (!isTrackedChannel) {
        if (c.guild_id && storage.ignoreServersEnabled && storage.ignoredServerIds) {
          const ignoredServersList = storage.ignoredServerIds.split(",").map((id: string) => id.trim());
          if (ignoredServersList.includes(c.guild_id)) return;
        }

        if (c.guild_id && !storage.trackServers) return;
        if (c.type === 3 && !storage.trackGroups) return;
        if ((c.type === 1 || (c.type === 0 && !c.guild_id)) && !storage.trackDMs) return;
      }

      let matchedKeyword = "";

      for (let kw of storage.keywords) {
        let content = fullContent;
        let testKw = kw;

        if (!storage.caseSensitive) {
          content = content.toLowerCase();
          testKw = testKw.toLowerCase();
        }

        let isMatch = false;
        if (storage.exactMatch) {
          isMatch = content === testKw;
        } else if (storage.wholeWords) {
          const regex = new RegExp(`\\b${testKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, storage.caseSensitive ? '' : 'i');
          isMatch = regex.test(content);
        } else if (storage.inSentence) {
          isMatch = content.includes(testKw);
        } else {
          const regex = new RegExp(`\\b${testKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, storage.caseSensitive ? '' : 'i');
          isMatch = regex.test(fullContent);
        }

        if (isMatch) {
          matchedKeyword = kw;
          break;
        }
      }

      if (!matchedKeyword) return;

      const author = m.author;
      const authorName = author.username;
      
      const sendToChannel = storage.sendNotificationToChannel && storage.targetChannelId;
      const sendToWebhook = storage.sendNotificationToWebhook && storage.webhookUrl;

      if (sendToChannel || sendToWebhook) {
        let messageContent = `# **Keyword Detected!**\n\n`;
        messageContent += `**User:** <@${author.id}>\n`;
        messageContent += `    Username: \`@${authorName}\`\n`;
        messageContent += `    ID: \`${author.id}\`\n`;
        messageContent += `**Keyword:** \`${matchedKeyword}\`\n`;
        messageContent += `**Message:**\n${m.content || "[Embed Message]"}\n`;

        if (c.guild_id) {
          const g = GuildStore.getGuild(c.guild_id);
          messageContent += `**Location:** Server\n`;
          messageContent += `**Server:**\n`;
          messageContent += `    Name: \`${g?.name}\`\n`;
          messageContent += `    ID: \`${c.guild_id}\`\n`;
          messageContent += `**Channel:** <#${c.id}>\n`;
          messageContent += `    Name: \`${c.name}\`\n`;
          messageContent += `    ID: \`${c.id}\`\n`;
          messageContent += `**Message Link:** https://discord.com/channels/${c.guild_id}/${c.id}/${m.id}`;
        } else if (c.type === 3) {
          messageContent += `**Location:** Group\n`;
          messageContent += `**Group:** <#${c.id}>\n`;
          messageContent += `    Name: \`${c.name || 'Unnamed Group'}\`\n`;
          messageContent += `    ID: \`${c.id}\`\n`;
          messageContent += `**Message Link:** https://discord.com/channels/@me/${c.id}/${m.id}`;
        } else {
          messageContent += `**Location:** DM\n`;
          messageContent += `**Message Link:** https://discord.com/channels/@me/${c.id}/${m.id}`;
        }

        if (sendToChannel) {
          RestAPI.post({
            url: `/channels/${storage.targetChannelId.trim()}/messages`,
            body: { content: messageContent }
          }).catch(() => {});
        }

        if (sendToWebhook) {
          fetch(storage.webhookUrl.trim(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ content: messageContent })
          }).catch(() => {});
        }
        
        showToast(`${authorName} sent a tracked message`);
      } else {
        let locationStr = "DM";
        if (c.guild_id) {
          const g = GuildStore.getGuild(c.guild_id);
          locationStr = `Server: ${g?.name} #${c.name}`;
        } else if (c.type === 3) {
          locationStr = `Group: ${c.name || 'Unnamed'}`;
        }
        showToast(`${authorName} said "${matchedKeyword}" in ${locationStr}`);
      }
    };

    FluxDispatcher.subscribe("MESSAGE_CREATE", onMessage);
    unsubMessage = () => FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessage);
  },

  onUnload() {
    unsubMessage?.();
    if (unpatchSidebar) {
      unpatchSidebar();
      unpatchSidebar = null;
    }
  },

  settings: Settings,
};
