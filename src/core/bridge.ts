// JS -> native calls. The tweak hooks React Native's FileReaderModule
// (`readAsDataURL`), which exists in every RN build and accepts an arbitrary
// object, so it works with both the legacy bridge and bridgeless mode.
// Payloads carrying our key are handled natively in tweak/Sources/DSTBridge.m;
// anything else falls through to the original implementation.

import { getNativeModule } from "./native";
import { isForeignLoader, loader } from "./loader";

type BridgeResponse = { result: unknown } | { error: string };

let module: Record<string, (...args: any[]) => Promise<any>> | undefined;

export class BridgeError extends Error {
    constructor(method: string, message: string) {
        super(`${method}: ${message}`);
        this.name = "BridgeError";
    }
}

export function isBridgeAvailable() {
    return !isForeignLoader && getNativeModule(loader.bridge.module) != null;
}

export async function callNative<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    module ??= getNativeModule(loader.bridge.module);
    if (!module || isForeignLoader) throw new BridgeError(method, "native bridge unavailable");

    const response: BridgeResponse = await module[loader.bridge.method]({
        [loader.bridge.key]: { method, args },
    });

    if (response == null || typeof response !== "object") {
        throw new BridgeError(method, "the native hook did not handle the call");
    }
    if ("error" in response) throw new BridgeError(method, response.error);
    return response.result as T;
}
