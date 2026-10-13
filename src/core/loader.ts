// The native tweak evaluates a payload before this bundle that describes the
// loader and the current launch. See tweak/Sources/DCDLoader.m.

export interface LoaderPayload {
    name: string;
    version: string;
    platform: "ios";
    /** Whether the tweak is installed through a jailbreak (vs. injected into an IPA). */
    jailbroken: boolean;
    bridge: { module: string; method: string; key: string };
    discord: { version: string; build: string; bundleId: string };
    safeMode: { enabled: boolean; reason: "user" | "crash-loop" | null; failedBoots: number };
    config: LoaderConfig;
    /** Where the running bundle came from. */
    bundle: { source: "embedded" | "custom-url"; version: string };
}

/** Documents/Discordia/loader.json, read natively at launch (tweak/Sources/DCDLoader.m). */
export interface LoaderConfig {
    customLoadUrl: { enabled: boolean; url: string };
    safeMode: boolean;
    /** Native banner a few seconds after launch saying whether Discordia started. */
    showStartupBanner: boolean;
}

declare global {
    // eslint-disable-next-line no-var
    var __DISCORDIA_LOADER__: LoaderPayload | undefined;
}

const fallback: LoaderPayload = {
    name: "Unknown",
    version: "0.0.0",
    platform: "ios",
    jailbroken: false,
    bridge: { module: "FileReaderModule", method: "readAsDataURL", key: "discordia" },
    discord: { version: "unknown", build: "unknown", bundleId: "unknown" },
    safeMode: { enabled: false, reason: null, failedBoots: 0 },
    config: { customLoadUrl: { enabled: false, url: "" }, safeMode: false, showStartupBanner: false },
    bundle: { source: "embedded", version: "unknown" },
};

/** True when Discordia's JS was loaded by something other than the Discordia tweak. */
export const isForeignLoader = globalThis.__DISCORDIA_LOADER__ == null;

export const loader: LoaderPayload = globalThis.__DISCORDIA_LOADER__ ?? fallback;

export const isSafeMode = () => loader.safeMode.enabled;
