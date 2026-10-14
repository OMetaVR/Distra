// stole from https://github.com/m4fn3/FreeNitroTheme/blob/master/src/index.tsx
import { findByProps, findByStoreName } from "@vendetta/metro"
import { instead, after } from "@vendetta/patcher"
import { storage } from "@vendetta/plugin"

const AppearanceSettings = findByProps("setShouldSyncAppearanceSettings")
const canUse = findByProps("canUseClientThemes")
const ThemeUtils = findByProps("updateBackgroundGradientPreset")
const ExperimentStore = findByStoreName("ExperimentStore")

storage.isEnabled ??= false

// Distra: the original turned off "sync appearance settings across devices" on every start so the
// theme sticks. Developer Mode and other appearance settings sync with it, so they went back to
// their defaults each launch. Sync is now only turned off while a client theme is actually in use.
const setSync = AppearanceSettings.setShouldSyncAppearanceSettings.bind(AppearanceSettings)
const themeActive = () => !!(storage.theme && storage.isEnabled)
setSync(!themeActive())
if (themeActive()) {
    ThemeUtils.updateBackgroundGradientPreset(storage.theme)
}

const patches = [
    instead("setShouldSyncAppearanceSettings", AppearanceSettings, () => false),
    instead("canUseClientThemes", canUse, () => true),
    after("getUserExperimentDescriptor", ExperimentStore, ([expName], res) => {
        if (expName === "2023-02_client_themes_mobile" && res?.bucket) {
            return {
                type: "user",
                revision: 1,
                population: 0,
                bucket: 1,
                override: true
            }
        }
    }),
    after("updateMobilePendingThemeIndex", ThemeUtils, (args) => {
        storage.isEnabled = args[0] > 1 // 0 ~ 1 | default || 2 ~ | client themes
        setSync(!themeActive())
    }),
    after("updateBackgroundGradientPreset", ThemeUtils, (args) => {
        storage.theme = args[0]
    })
]

export const onUnload = () => {
    for (const unpatch of patches) unpatch()
    setSync(true)
}

