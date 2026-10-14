import { callNative } from "./bridge";
import { type LoaderConfig, loader } from "./loader";
import { createFileStorage, createMemoryBackend, createStorage, type StorageBackend } from "./storage";

export interface DistraSettings {
    /** Shows the Developer page. */
    developerSettings: boolean;
    /** Active icon pack id, or null for Discord's own icons. Applied on reload. */
    iconPack: string | null;
    /** Settings section label the Distra section is inserted after. */
    settingsAnchor: string;
}

const defaults: DistraSettings = {
    developerSettings: false,
    iconPack: null,
    settingsAnchor: "ACCOUNT",
};

export let settings: DistraSettings = { ...defaults };

/**
 * The tweak's own configuration (Documents/Distra/loader.json). Read by native
 * code at launch, so changes apply on the next reload.
 */
export let loaderConfig: LoaderConfig = loader.config;

const loaderConfigBackend: StorageBackend<LoaderConfig> = {
    get: () => callNative<LoaderConfig>("loader.getConfig"),
    set: config => callNative("loader.setConfig", config),
};

export async function initSettings() {
    settings = await createFileStorage<DistraSettings>("settings.json", defaults);
    loaderConfig = await createStorage(loaderConfigBackend).catch(() => createStorage(createMemoryBackend(loader.config)));
}
