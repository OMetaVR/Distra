// React Native treats an exception thrown from an event handler (a button's onPress, a
// timer, a Flux callback) as fatal, and Discord's release build then terminates the whole
// app. When the stack shows the error came from a plugin (or Distra), we log it and carry
// on instead: a plugin's bug shouldn't cost the user their session.

import { logger } from "@/lib/logger";

const OUR_FRAME = /\b(?:vendetta|enmity|bunny|aliucord|revenge|distra):/;
const TOAST_EVERY_MS = 5_000;

let installed = false;
let lastToast = 0;

export function installErrorGuard(showError: (message: string) => void) {
    const errorUtils = (globalThis as any).ErrorUtils;
    if (installed || typeof errorUtils?.setGlobalHandler !== "function") return;
    installed = true;

    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
        const stack = String(error?.stack ?? "");
        if (isFatal && OUR_FRAME.test(stack)) {
            const first = stack.split("\n").find(line => OUR_FRAME.test(line))?.trim();
            logger.error(`Contained an error that would have crashed the app: ${error?.message ?? error}\n  at ${first}`);
            if (Date.now() - lastToast > TOAST_EVERY_MS) {
                lastToast = Date.now();
                try {
                    showError(`A plugin hit an error: ${String(error?.message ?? error).slice(0, 120)}`);
                } catch { }
            }
            return;
        }
        return previous?.(error, isFatal);
    });
}
