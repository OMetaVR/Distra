// Frequently used Discord / React Native modules, resolved lazily.

import { lazyDestructure, proxyLazy } from "@/lib/lazy";

import { find, findByFilePathLazy, findByProps, findByPropsLazy, findByStoreNameLazy } from ".";
import { bySingularProp } from "./filters";

export const React = findByPropsLazy("createElement", "useState") as typeof import("react");
export const ReactNative = findByPropsLazy("AppRegistry", "View") as typeof import("react-native");

// Navigation
export const NavigationNative = findByPropsLazy("NavigationContainer", "useNavigation");
export const navigationStack = findByPropsLazy("createStackNavigator");
export const navigation = findByPropsLazy("pushLazy");
export const tabsNavigationRef = findByPropsLazy("getRootNavigationRef");

// Flux
/**
 * Discord's Flux utilities. The store hooks (useStateFromStores, ...) moved to another module;
 * they're merged in because plugins read them from Flux.
 */
export const Flux = proxyLazy(() => {
    const flux = findByProps("connectStores");
    const hooks = findByProps("useStateFromStores");
    return flux && hooks ? { ...hooks, ...flux, useStateFromStores: flux.useStateFromStores ?? hooks.useStateFromStores } : flux ?? hooks;
}, { hint: "Flux" });
export const FluxDispatcher = findByPropsLazy("_interceptors", "dispatch");
export const { useStateFromStores } = lazyDestructure(() => findByProps("useStateFromStores"));

// Discord utilities
export const constants = findByPropsLazy("Fonts", "Permissions");
export const i18n = findByPropsLazy("Messages");
export const clipboard = findByPropsLazy("setString", "getString", "hasString");
export const assetsRegistry = findByPropsLazy("registerAsset", "getAssetByID");
export const toasts = findByFilePathLazy("modules/toast/native/ToastActionCreators.tsx", true);
export const messageUtil = findByPropsLazy("sendBotMessage");
export const commands = findByPropsLazy("getBuiltInCommands");
export const tokens = findByPropsLazy("unsafe_rawColors", "colors");
export const semver = findByPropsLazy("parse", "clean", "satisfies");

export const UserStore = findByStoreNameLazy("UserStore");
export const ThemeStore = findByStoreNameLazy("ThemeStore");

/** Opens a URL the same way Discord's own links do. */
export const url = {
    openURL: (target: string) => ReactNative.Linking.openURL(target),
    openDeeplink: (target: string) => ReactNative.Linking.openURL(target),
};

/** React Native's `resolveAssetSource`, used to redirect bundled image assets. */
export const resolveAssetSource = proxyLazy(() => find(Object.assign(
    (m: any) => typeof m === "function" && typeof m.setCustomSourceTransformer === "function",
    { key: "distra.resolveAssetSource" },
)));

export const ScrollView = proxyLazy(() => ReactNative.ScrollView);

/** Find helper for modules that are often wrapped (e.g. `{ default: Component }`). */
export const findProp = (...props: string[]) => proxyLazy(() => findByProps(...props)?.[props[0]], { hint: props[0] });
export const findSingular = (prop: string) => proxyLazy(() => find(bySingularProp(prop))?.[prop], { hint: prop });
