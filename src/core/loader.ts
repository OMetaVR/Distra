// The native tweak evaluates a payload before this bundle that describes the
// loader and the current launch. See tweak/Sources/DSTLoader.m.

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

/** Documents/Distra/loader.json, read natively at launch (tweak/Sources/DSTLoader.m). */
export interface LoaderConfig {
    customLoadUrl: { enabled: boolean; url: string };
    safeMode: boolean;
    /** Native banner after a launch that went fine (problems always show one). */
    showSuccessBanner: boolean;
    /** Connects to `pnpm devtools` on a development machine (src/core/devtools.ts). */
    remoteDebugger?: { enabled: boolean; url: string };
}

declare global {
    // eslint-disable-next-line no-var
    var __DISTRA_LOADER__: LoaderPayload | undefined;
}

const fallback: LoaderPayload = {
    name: "Unknown",
    version: "0.0.0",
    platform: "ios",
    jailbroken: false,
    bridge: { module: "FileReaderModule", method: "readAsDataURL", key: "distra" },
    discord: { version: "unknown", build: "unknown", bundleId: "unknown" },
    safeMode: { enabled: false, reason: null, failedBoots: 0 },
    config: { customLoadUrl: { enabled: false, url: "" }, safeMode: false, showSuccessBanner: false },
    bundle: { source: "embedded", version: "unknown" },
};

/** True when Distra's JS was loaded by something other than the Distra tweak. */
export const isForeignLoader = globalThis.__DISTRA_LOADER__ == null;

export const loader: LoaderPayload = globalThis.__DISTRA_LOADER__ ?? fallback;

export const isSafeMode = () => loader.safeMode.enabled;
