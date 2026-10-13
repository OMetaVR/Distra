// Discordia's startup, called from entry.ts. `init` runs before Discord's app
// component starts (Discord is held until it resolves), `start` runs after.

import { callNative, isBridgeAvailable } from "@/core/bridge";
import { startRemoteDebugger } from "@/core/devtools";
import { isForeignLoader, isSafeMode, loader } from "@/core/loader";
import { initSettings, loaderConfig, settings } from "@/core/settings";
import { patchCommands, registerCommand } from "@/lib/commands";
import { initIconPack } from "@/lib/iconpacks";
import { getLogEntries, logger } from "@/lib/logger";
import { corePatcher, createPatcher } from "@/lib/patcher";
import * as metro from "@/metro";
import { loadMetroCache } from "@/metro/cache";
import * as common from "@/metro/common";
import { installBunnyGlobals } from "@/compat/bunny";
import { installEnmityGlobals, loadEnmitySettings } from "@/compat/enmity";
import { patchChatCommands } from "@/compat/native";
import { installVendettaGlobals } from "@/compat/vendetta";
import * as pluginManager from "@/plugins/manager";
import { patchSettings, registerSection } from "@/ui/settings";
import { registerDiscordiaSection } from "@/ui/settings/sections";
import { prepareColorModule } from "@/ui/color";
import { showToast } from "@/ui/toasts";

/** Seconds Discord has to stay up before the launch counts as successful (see safe mode). */
const STABLE_AFTER_MS = 15_000;

const failedSteps: string[] = [];

async function step<T>(name: string, fn: () => T | Promise<T>): Promise<T | undefined> {
    const started = Date.now();
    try {
        const result = await fn();
        logger.debug(`Startup step "${name}" done in ${Date.now() - started}ms`);
        return result;
    } catch (e) {
        failedSteps.push(name);
        logger.error(`Startup step "${name}" failed`, e);
        return undefined;
    }
}

export async function init() {
    const started = Date.now();
    logger.info(`Discordia ${DISCORDIA_VERSION} (${DISCORDIA_COMMIT}) on Discord ${loader.discord.version} (${loader.discord.build}), bundle: ${loader.bundle.source}`);
    logger.info(`Metro registry: ${Object.keys(globalThis.modules ?? {}).length} modules; native modules: turbo=${typeof globalThis.__turboModuleProxy === "function"} legacy=${globalThis.nativeModuleProxy != null}`);

    try {
        startRemoteDebugger();
    } catch (e) {
        logger.error("Remote debugger failed to start", e);
    }

    if (isForeignLoader) logger.warn("Not loaded by the Discordia tweak; native features are unavailable");
    else if (!isBridgeAvailable()) logger.error("Native bridge module missing; settings will not persist");

    await step("settings", initSettings);
    await step("metro cache", () => loadMetroCache(loader.discord.build));

    await step("compat globals", async () => {
        installVendettaGlobals();
        installBunnyGlobals();
        installEnmityGlobals();
        patchChatCommands();
        prepareColorModule();
        await loadEnmitySettings();
    });

    await step("settings ui", () => {
        registerDiscordiaSection();
        patchSettings();
    });
    await step("commands", patchCommands);
    await step("icon pack", initIconPack);

    globalThis.discordia = createGlobalApi();
    const durationMs = Date.now() - started;
    logger.info(`Initialized in ${durationMs}ms${isSafeMode() ? " (safe mode)" : ""}${failedSteps.length ? `; failed steps: ${failedSteps.join(", ")}` : ""}`);

    if (!isForeignLoader) {
        callNative("diag.ready", { version: DISCORDIA_VERSION, durationMs, failedSteps, safeMode: isSafeMode() })
            .catch(e => logger.error("Could not report startup status to the tweak", e));
    }
}

export async function start() {
    await step("plugins", pluginManager.initPlugins);

    if (isSafeMode()) {
        setTimeout(() => showToast("Discordia is in safe mode"), 2000);
    }

    // Tell the tweak this launch survived, resetting its crash-loop counter.
    setTimeout(() => {
        if (!isForeignLoader) callNative("boot.markStable").catch(e => logger.warn("Could not mark launch stable", e));
    }, STABLE_AFTER_MS);
}

function createGlobalApi() {
    return {
        version: DISCORDIA_VERSION,
        loader,
        settings,
        loaderConfig,
        metro: { ...metro, common },
        patcher: { create: createPatcher, core: corePatcher },
        plugins: pluginManager,
        commands: { registerCommand },
        settingsUI: { registerSection },
        native: { call: callNative },
        logger,
        getLogEntries,
    };
}

declare global {
    // eslint-disable-next-line no-var
    var discordia: ReturnType<typeof createGlobalApi> | undefined;
}
