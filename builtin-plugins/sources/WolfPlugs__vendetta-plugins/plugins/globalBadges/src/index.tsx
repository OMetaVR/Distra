import { findByName } from "@vendetta/metro";
import { after, instead } from "@vendetta/patcher";
import Settings from "./Settings";
import { storage } from "@vendetta/plugin";
import { GlobalBadges, applyBadgeLimit, badgeUtils, DISCORD_MAX_BADGES, loadBadges } from "./utils";
import { BadgeProps } from "./types";
import { React } from "@vendetta/metro/common";
import AnimatedBadge, { canAnimate } from "./AnimatedBadge";

const bunny = (window as any).bunny.api.react.jsx;
const REFRESH_INTERVAL = 1000 * 60 * 30;
const badgeModule = findByName("useBadges", false);

let unpatch;
let unpatchIcons;
let intervalId;

// Distra: Discord 348 renders a badge's icon from `getProfileBadgeIconUrl(badge)` (the ProfileBadge
// component has no stable name any more), so global badges answer for their own URL there.
const iconUrls = new Map<string, string>();
export default {
  onLoad: async () => {
    storage.left ??= false;
    storage.showAll ??= false;
    storage.showModStyle ??= "none";
    storage.showAero ??= true;
    storage.showAliucord ??= true;
    storage.showCustom ??= true;
    storage.showBetterDiscord ??= true;
    storage.showBunny ??= true;
    storage.showEnmity ??= true;
    storage.showEquicord ??= true;
    storage.showGooseMod ??= true;
    storage.showNekocord ??= true;
    storage.showPaicord ??= true;
    storage.showReCord ??= true;
    storage.showReplugged ??= true;
    storage.showRevenge ??= true;
    storage.showReviewDB ??= true;
    storage.showVelocity ??= true;
    storage.showVencord ??= true;
    storage.showVendroidEnhanced ??= true;

    applyBadgeLimit();
    if (badgeUtils) {
      unpatchIcons = instead("getProfileBadgeIconUrl", badgeUtils, ([badge], original) =>
        iconUrls.get(badge?.id) ?? original(badge));
    }

    await loadBadges();
    intervalId = setInterval(loadBadges, REFRESH_INTERVAL);
    // Distra: Show Badges In Chat reads the loaded badges from here.
    (window as any).distraGlobalBadges = { badgesFor: (userId: string) => GlobalBadges[userId] ?? [] };

    const badgeProps = {} as Record<string, BadgeProps>;

    bunny.onJsxCreate("ProfileBadge", (component: any, ret: any) => {
      if (ret.props.id?.startsWith("gb-")) {
        const badgePropsCache = badgeProps[ret.props.id];
        if (badgePropsCache && canAnimate()) {
          return React.createElement(AnimatedBadge, {
            key: ret.key ?? badgePropsCache.id,
            uri: badgePropsCache.source.uri,
            label: badgePropsCache.label,
            size: ret.props.badgeSize,
          });
        }
        if (badgePropsCache) {
          ret.props.source = badgePropsCache.source;
          ret.props.label = badgePropsCache.label;
          ret.props.id = badgePropsCache.id;
        }
      }
    });

    bunny.onJsxCreate("RenderBadge", (component: any, ret: any) => {
      if (ret.props.id?.startsWith("gb-")) {
        const badgePropsCache = badgeProps[ret.props.id];
        if (badgePropsCache) {
          Object.assign(ret.props, badgePropsCache);
        }
      }
    });

    unpatch = after("default", badgeModule, ([user], result) => {
      if (user === null) return;

      const userBadges = GlobalBadges[user.userId];
      if (!userBadges) return;

      const pushBadges = (badge: any) => {
        if (storage.left) {
          result.unshift(badge);
        } else {
          result.push(badge);
        }
      };

      userBadges.forEach((badge, idx) => {
        const badgeId = `gb-${badge.mod}-${idx}`;
        iconUrls.set(badgeId, badge.badge);
        badgeProps[badgeId] = {
          id: badgeId,
          source: { uri: badge.badge },
          label: badge.tooltip,
          userId: user.userId,
        };
        pushBadges({
          id: badgeId,
          description: badge.tooltip,
          icon: "dummy",
        });
      });
    });
  },
  onUnload: () => {
    delete (window as any).distraGlobalBadges;
    unpatch?.();
    unpatchIcons?.();
    if (badgeUtils) badgeUtils.MAX_DISPLAYED_PROFILE_BADGES = DISCORD_MAX_BADGES;
    clearInterval(intervalId);
  },
  settings: Settings
};