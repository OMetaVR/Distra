// First-party plugins. They appear in the Plugin Library next to the vendored ones.

import messageLogger from "./messagelogger";
import platformIndicators from "./platformindicators";
import radialStatus from "./radialstatus";
import hideChatButtons from "./hidechatbuttons";
import fakeNitro from "./fakenitro";
import type { CorePlugin } from "./types";

export const corePlugins: CorePlugin[] = [messageLogger, platformIndicators, radialStatus, hideChatButtons, fakeNitro];

export const getCorePlugin = (id: string) => corePlugins.find(plugin => plugin.id === id);
