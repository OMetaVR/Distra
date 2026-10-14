// Injects Distra's rows into Discord's settings screen.
//
// Discord's settings are data driven: SETTING_RENDERER_CONFIG maps a key to a
// row definition (pressable row or route), and `createList` receives the
// sections listing which keys to show. We add our rows to the former and our
// sections to the latter.

import { memo, useEffect } from "react";
import type { ImageURISource } from "react-native";

import { settings } from "@/core/settings";
import { findAssetId } from "@/lib/assets";
import { logger } from "@/lib/logger";
import { corePatcher } from "@/lib/patcher";
import { byMethods, fromPredicate, waitFor } from "@/metro";
import { NavigationNative, tabsNavigationRef } from "@/metro/common";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { TableRow } from "@/ui/components";

export interface SettingsRow {
    key: string;
    title: () => string;
    /** An asset name (resolved when the row renders), asset id, or image source. */
    icon?: string | ImageURISource | number;
    /** Lazily loads the page component. Ignored when `onPress` is set. */
    render?: () => Promise<{ default: React.ComponentType<any> }>;
    onPress?: () => void;
    usePredicate?: () => boolean;
    useTrailing?: () => string | React.ReactNode;
}

export const registeredSections: Record<string, SettingsRow[]> = {};

export function registerSection(name: string, rows: SettingsRow[]) {
    registeredSections[name] = [...(registeredSections[name] ?? []), ...rows];
    refreshRendererConfig();
    return () => {
        registeredSections[name] = (registeredSections[name] ?? []).filter(row => !rows.includes(row));
        if (!registeredSections[name].length) delete registeredSections[name];
        refreshRendererConfig();
    };
}

/** Route used for every Distra (and compat plugin) page. */
export const CUSTOM_PAGE_ROUTE = "DISTRA_CUSTOM_PAGE";
// Routes other mods used; plugins navigate to these directly.
const COMPAT_ROUTES = ["VendettaCustomPage", "BUNNY_CUSTOM_PAGE", "PUPU_CUSTOM_PAGE"];

const CustomPage = memo(() => {
    const navigation = NavigationNative.useNavigation();
    const route = NavigationNative.useRoute();
    const { render: Page, ...options } = route.params ?? {};

    useEffect(() => void navigation.setOptions(options), []);
    return <ErrorBoundary>{Page ? <Page /> : null}</ErrorBoundary>;
});

/**
 * Opens a page. Pass the current screen's `navigation` when opening a page from
 * another page so it is pushed on top instead of replacing it.
 */
export function openPage(title: string, Page: React.ComponentType<any>, navigation?: any) {
    const params = { title, render: Page };
    if (typeof navigation?.push === "function") navigation.push(CUSTOM_PAGE_ROUTE, params);
    else tabsNavigationRef.getRootNavigationRef().navigate(CUSTOM_PAGE_ROUTE, params);
}

const resolveIcon = (icon: SettingsRow["icon"]) => typeof icon === "string" ? findAssetId(icon) : icon;

function rowToConfig(row: SettingsRow) {
    return {
        type: "pressable",
        title: row.title,
        useTitle: row.title,
        get icon() {
            return resolveIcon(row.icon);
        },
        IconComponent: row.icon != null ? () => <TableRow.Icon source={resolveIcon(row.icon)} /> : undefined,
        usePredicate: row.usePredicate,
        useTrailing: row.useTrailing,
        withArrow: true,
        onPress: async () => {
            if (row.onPress) return row.onPress();
            if (!row.render) return;
            const { default: Page } = await row.render();
            openPage(row.title(), Page);
        },
    };
}

const routeConfig = (route: string) => ({
    type: "route",
    title: () => "Distra",
    useTitle: () => "Distra",
    screen: { route, getComponent: () => CustomPage },
});

let originalConfig: Record<string, any> | undefined;
/**
 * The config Discord sees. Always the same object, updated in place: plugins that wrap
 * SETTING_RENDERER_CONFIG themselves (as Vendetta-era plugins do) keep a reference to the value
 * they read and spread it on every access, so later Distra rows must land in that object.
 */
const liveConfig: Record<string, any> = {};

function refreshRendererConfig() {
    if (!originalConfig) return;
    for (const key of Object.keys(liveConfig)) delete liveConfig[key];
    Object.assign(
        liveConfig,
        originalConfig,
        Object.fromEntries([CUSTOM_PAGE_ROUTE, ...COMPAT_ROUTES].map(route => [route, routeConfig(route)])),
        Object.fromEntries(Object.values(registeredSections).flat().map(row => [row.key, rowToConfig(row)])),
    );
}

function patchRendererConfig(rendererConfig: any) {
    originalConfig = rendererConfig.SETTING_RENDERER_CONFIG;
    refreshRendererConfig();
    Object.defineProperty(rendererConfig, "SETTING_RENDERER_CONFIG", {
        enumerable: true,
        configurable: true,
        get: () => liveConfig,
        set: value => {
            if (value === liveConfig) return;
            originalConfig = value;
            refreshRendererConfig();
        },
    });
    corePatcher.addCleanup(() => Object.defineProperty(rendererConfig, "SETTING_RENDERER_CONFIG", {
        value: originalConfig,
        writable: true,
        enumerable: true,
        configurable: true,
    }));
    logger.info(`Patched SETTING_RENDERER_CONFIG (${Object.keys(originalConfig ?? {}).length} rows)`);
}

const PLUGIN_SECTION = "Plugin Settings";

/**
 * Plugins pin their own settings row by appending a key to the Distra section's `settings`.
 * Those go in a "Plugin Settings" section of their own, so Distra's section stays about Distra.
 */
function keepPluginRowsApart(sections: any[], distra: any) {
    const own = new Set<string>(distra.settings);
    const ownKeys: string[] = distra.settings;
    const pinned: string[] = [];
    let pluginSection: any;
    Object.defineProperty(distra, "settings", {
        enumerable: true,
        configurable: true,
        get: () => ownKeys,
        set: (value: string[]) => {
            for (const key of value) {
                if (!own.has(key) && !pinned.includes(key)) pinned.push(key);
            }
            if (!pinned.length || pluginSection) return;
            pluginSection = { label: PLUGIN_SECTION, title: PLUGIN_SECTION, settings: pinned };
            sections.splice(sections.indexOf(distra) + 1, 0, pluginSection);
        },
    });
}

function patchCreateList(listModule: any) {
    let reported = false;
    corePatcher.after("createList", listModule, ([config]) => {
        const sections: any[] | undefined = config?.sections;
        if (!Array.isArray(sections)) return;
        // Only the root settings list contains the ACCOUNT row.
        if (!sections.some(section => section.settings?.includes("ACCOUNT"))) return;

        const anchor = sections.findIndex(section => section.settings?.includes(settings.settingsAnchor));
        let index = anchor === -1 ? 1 : anchor + 1;
        for (const [name, rows] of Object.entries(registeredSections)) {
            if (!rows.length || sections.some(section => section.label === name)) continue;
            const section = { label: name, title: name, settings: rows.map(row => row.key) };
            sections.splice(index++, 0, section);
            if (name === "Distra") keepPluginRowsApart(sections, section);
        }

        if (!reported) {
            reported = true;
            logger.info(`Settings list built; sections: ${sections.map(section => section.label ?? section.title ?? "?").join(", ")}`);
        }
    });
    logger.info("Patched createList");
}

/**
 * Patches Discord's settings modules as soon as Discord loads them (or now, if
 * it already has). Waiting instead of searching avoids loading every module at startup.
 */
export function patchSettings() {
    const guard = (name: string, patch: (module: any) => void) => (module: any) => {
        try {
            patch(module);
        } catch (e) {
            logger.error(`Could not patch ${name}`, e);
        }
    };

    const rendererConfig = fromPredicate(m => {
        const config = m.SETTING_RENDERER_CONFIG;
        return config != null && typeof config === "object" && Object.keys(config).length > 0;
    }, "distra.SETTING_RENDERER_CONFIG");

    corePatcher.addCleanup(waitFor(rendererConfig, guard("SETTING_RENDERER_CONFIG", patchRendererConfig)));
    corePatcher.addCleanup(waitFor(byMethods("createList"), guard("createList", patchCreateList)));
    logger.info("Waiting for Discord's settings modules");
}
