// Adapted from: https://github.com/nexpid/RevengePlugins/blob/main/src/stuff/lib/pinToSettings/tabs.tsx

import { findByName, findByProps } from "@vendetta/metro";
import { after } from "@lib/patcher";
import { manifest } from "@vendetta/plugin";
import { findInReactTree } from "@vendetta/utils";

const { TableRowIcon } = findByProps("TableRowIcon");
const tabsNavigationRef = findByProps("getRootNavigationRef");
const settingsConstants = findByProps("SETTING_RENDERER_CONFIG");
const createListModule = findByProps("createList");
const SettingsOverviewScreen = findByName("SettingsOverviewScreen");

export function patchTabsUI(tile: SettingsTile) {
    const patches: (() => void)[] = [];

    const row = {
        [tile.key]: {
            type: "pressable",
            title: tile.title,
            useTitle: tile.title,
            icon: tile.icon,
            IconComponent:
                tile.icon && (() => <TableRowIcon source={tile.icon} />),
            usePredicate: tile.predicate,
            useTrailing: tile.trailing,
            onPress: () => {
                const navigation = tabsNavigationRef.getRootNavigationRef();
                const Page = tile.page;

                navigation.navigate("BUNNY_CUSTOM_PAGE", {
                    title: tile.title(),
                    render: () => <Page />,
                });
            },
            withArrow: true,
        },
    };

    let rendererConfig = settingsConstants.SETTING_RENDERER_CONFIG;

    Object.defineProperty(settingsConstants, "SETTING_RENDERER_CONFIG", {
        enumerable: true,
        configurable: true,
        get: () => ({ ...rendererConfig, ...row }),
        set: (v) => (rendererConfig = v),
    });

    const firstRender = Symbol("please work 🤞");

    try {
        if (!createListModule) return;

        patches.push(
            after(
                "createList",
                createListModule,
                function (args, ret) {
                    if (!args[0][firstRender]) {
                        args[0][firstRender] = true;

                        const [config] = args;
                        const sections = config.sections;

                        const section = sections?.find((x: any) =>
                            ["Bunny", "Kettu", "Revenge"].some(
                                (mod) => x.label === mod && x.title === mod,
                            ),
                        );

                        // If not using these mods
                        if (!section) {
                            const isMainSettings = Boolean(
                                sections?.find(
                                    (x: any) => x.settings.includes("ACCOUNT"),
                                ),
                            );

                            if (isMainSettings) {
                                // Add a new section to the top
                                sections.unshift({
                                    label: manifest.name,
                                    title: manifest.name,
                                    settings: [tile.key],
                                });
                            }
                        }

                        if (section?.settings) {
                            section.settings = [...section.settings, tile.key];
                        }
                    }
                },
                true,
            ),
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
                        ["Bunny", "Kettu", "Revenge"].some(
                            (mod) => x.label === mod && x.title === mod,
                        ),
                    );

                    // If not using these mods
                    if (!section) {
                        const isMainSettings = Boolean(
                            sections?.find(
                                (x: any) => x.settings.includes("ACCOUNT"),
                            ),
                        );

                        if (isMainSettings) {
                            // Add a new section to the top
                            sections.unshift({
                                label: manifest.name,
                                title: manifest.name,
                                settings: [tile.key],
                            });
                        }
                    }

                    if (section?.settings) {
                        section.settings = [...section.settings, tile.key];
                    }
                }
            }),
        );
    }

    return () => {
        for (const unpatch of patches) {
            unpatch();
        }
    };
}
