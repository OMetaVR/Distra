// First-party plugins. They appear in the Plugin Library next to the vendored ones.

import messageLogger from "./messagelogger";
import platformIndicators from "./platformindicators";
import radialStatus from "./radialstatus";
import hideChatButtons from "./hidechatbuttons";
import fakeNitro from "./fakenitro";
import pinDms from "./pindms";
import friendshipRanks from "./friendshipranks";
import whosTyping from "./whostyping";
import customTimestamps from "./customtimestamps";
import timezones from "./timezones";
import lastActive from "./lastactive";
import hideMessages from "./hidemessages";
import blockKeywords from "./blockkeywords";
import downloadAttachments from "./downloadattachments";
import whoReacted from "./whoreacted";
import clickableRoles from "./clickableroles";
import customFolderIcons from "./customfoldericons";
import messageColors from "./messagecolors";
import roleColorEverywhere from "./rolecoloreverywhere";
import showBadgesInChat from "./showbadgesinchat";
import volumeBooster from "./volumebooster";
import voiceStats from "./voicestats";
import betterCodeBlocks from "./codeblocks";
import fontLoader from "./fontloader";
import type { CorePlugin } from "./types";

export const corePlugins: CorePlugin[] = [messageLogger, platformIndicators, radialStatus, hideChatButtons, fakeNitro, pinDms, friendshipRanks, whosTyping, customTimestamps, timezones, lastActive, hideMessages, blockKeywords, downloadAttachments, whoReacted, clickableRoles, customFolderIcons, messageColors, roleColorEverywhere, showBadgesInChat, volumeBooster, voiceStats, betterCodeBlocks, fontLoader];

export const getCorePlugin = (id: string) => corePlugins.find(plugin => plugin.id === id);
