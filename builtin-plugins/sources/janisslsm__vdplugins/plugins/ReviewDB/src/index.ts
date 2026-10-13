import { storage } from "@vendetta/plugin";
import { getAdmins } from "./lib/api";
import patchProfile from "./patches/patchProfile";
import exposeAPI from "./patches/exposeAPI";
import patchSimplifiedProfile from "./patches/patchSimplifiedProfile";
import patchServer from "./patches/patchServer";
import patchContextMenu from "./patches/patchContextMenu";
import patchSegmentedProfile from "./patches/patchSegmentedProfile";
import patchAboutMeCard from "./patches/patchAboutMeCard";
// Default settings
storage.authToken ??= "";
storage.useThemedSend ??= true;
storage.showWarning ??= true;

const unpatchAboutMeCard = patchAboutMeCard();
const patches = [
	exposeAPI(),
	patchServer(),
	patchContextMenu(),
	// Older Discord versions: find the profile's section list instead.
	...(unpatchAboutMeCard ? [unpatchAboutMeCard] : [patchProfile(), patchSimplifiedProfile(), patchSegmentedProfile()]),
];

export const admins = [];
getAdmins().then((i) => Array.isArray(i) && admins.push(...i)).catch(() => { });

export const onUnload = () => patches.forEach((p) => p());

export { default as settings } from "./Settings";
