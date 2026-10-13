import { after } from "@vendetta/patcher";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";

storage.removeBanner ??= true;

let patches = [];
const sanitizedGuildCache = new WeakMap();

const shallowClonePreserveProto = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const clone = Object.create(Object.getPrototypeOf(obj));
  Object.assign(clone, obj);
  return clone;
};

const getSanitizedGuild = (guild) => {
  if (!guild || typeof guild !== "object") return guild;
  if (!storage.removeBanner) return guild;

  let cached = sanitizedGuildCache.get(guild);
  if (!cached) {
    cached = shallowClonePreserveProto(guild);
    sanitizedGuildCache.set(guild, cached);
  } else {
    Object.assign(cached, guild);
  }

  cached.banner = null;
  cached.bannerId = null;
  return cached;
};

export default {
  onLoad() {
    const unloadPatches = () => patches.forEach((p) => p?.());

    const load = () => {
      unloadPatches();
      patches = [];

      [findByProps("getGuild"), findByStoreName("GuildCacheStore"), findByStoreName("GuildStore")]
        .filter(Boolean)
        .forEach((store) => {
          if (!store.getGuild) return;

          patches.push(
            after("getGuild", store, (args, res) => {
              if (!res || !storage.removeBanner) return res;
              return getSanitizedGuild(res);
            })
          );
        });

      const guildBannerMods = [findByProps("getGuildBannerURL")].filter(Boolean);
      guildBannerMods.forEach((mod) => {
        if (!mod.getGuildBannerURL) return;
        patches.push(
          after("getGuildBannerURL", mod, (args, url) => (storage.removeBanner ? null : url))
        );
      });

      const seen = new Set();
      const bannerHookMods = [findByProps("useGuild", "useGuildBanner"), findByProps("useGuildBanner")]
        .filter(Boolean)
        .filter((mod) => {
          if (seen.has(mod)) return false;
          seen.add(mod);
          return true;
        });

      bannerHookMods.forEach((mod) => {
        if (mod.useGuild) {
          patches.push(
            after("useGuild", mod, (args, res) => {
              if (!res || !storage.removeBanner) return res;
              return getSanitizedGuild(res);
            })
          );
        }

        if (mod.useGuildBanner) {
          patches.push(
            after("useGuildBanner", mod, (args, url) => (storage.removeBanner ? null : url))
          );
        }
      });
    };

    load();
  },

  onUnload() {
    patches.forEach((p) => p?.());
  },
};
