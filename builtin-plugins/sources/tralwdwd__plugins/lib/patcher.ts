import { logger, plugin } from "@vendetta";
import {
    before as _before,
    after as _after,
    instead as _instead,
} from "@vendetta/patcher";

type AnyFn = (...args: any[]) => any;

function safePatchCallback(
    patchType: string,
    name: string,
    callback: AnyFn,
): AnyFn {
    return function (...args) {
        try {
            return callback(...args);
        } catch (error) {
            logger.error(
                `[${plugin.manifest.name}] Error occured during ${patchType} patch on ${name}.`,
                error,
            );
        }
    };
}

export const before = (...args: Parameters<typeof _before>) => {
    const callback = args[2];

    args[2] = safePatchCallback("before", args[0], callback);
    return _before(...args);
};

export const after = (...args: Parameters<typeof _after>) => {
    const callback = args[2];

    args[2] = safePatchCallback("after", args[0], callback);
    return _after(...args);
};

export const instead = (...args: Parameters<typeof _instead>) => {
    const callback = args[2];

    args[2] = safePatchCallback("instead", args[0], callback);
    return _instead(...args);
};

type Unpatch = () => void;

export type Cleanup = (...patches: Unpatch[]) => void;

export function createUnpatcher() {
    let unpatches: Unpatch[] = [];

    return {
        cleanup(...patches: Unpatch[]) {
            unpatches.push(...patches);
        },

        stop() {
            for (const unpatch of unpatches) {
                unpatch();
            }

            unpatches = [];
        },
    };
}
