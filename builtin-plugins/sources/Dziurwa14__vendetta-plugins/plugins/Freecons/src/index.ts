import { findByProps } from "@vendetta/metro";
import { instead, after } from "@vendetta/patcher";

const icons = findByProps("getOfficialAlternateIcons")
const iconsIds = findByProps("FreemiumAppIconIds")
const FreemiumAppIcons = iconsIds.FreemiumAppIconIds
let alternateIcons = icons.getOfficialAlternateIcons()
let mainIcons = icons.getIcons()

let patches = [];
export default {
    onLoad: () => {
        alternateIcons.forEach(x => x.isPremium = false)
        mainIcons.forEach(x => { x.isPremium = false });
        patches.push(instead("getIcons", icons, () => mainIcons));
        patches.push(instead("getOfficialAlternateIcons", icons, () => alternateIcons));
        patches.push(after("getIconById", icons, (_, ret) => {
            ret.isPremium = false;
        }));
        iconsIds.FreemiumAppIconIds = iconsIds.MasterAppIconIds;
    },
    onUnload: () => {
        iconsIds.FreemiumAppIconIds = FreemiumAppIcons;
        for (const unpatch of patches) unpatch()
    }
}