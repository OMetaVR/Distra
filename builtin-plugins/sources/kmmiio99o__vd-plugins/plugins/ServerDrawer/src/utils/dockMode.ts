import React from "react";

// The dock keeps its mode in a Reanimated shared value, which React can't subscribe to. One timer
// per shared value reads it for every component that cares, and only calls them when it changes.
const POLL_MS = 150;

type Listener = (mode: string | undefined) => void;
interface Poller { listeners: Set<Listener>; last?: string; timer?: ReturnType<typeof setInterval> }
const pollers = new Map<any, Poller>();

function read(shared: any): string | undefined {
    try {
        return shared.value ?? shared.get?.();
    } catch {
        return undefined;
    }
}

/** Calls `listener` with the dock mode now and whenever it changes. Returns an unsubscribe. */
export function subscribeDockMode(shared: any, listener: Listener): () => void {
    if (!shared) return () => { };
    let poller = pollers.get(shared);
    if (!poller) {
        const created: Poller = { listeners: new Set(), last: read(shared) };
        created.timer = setInterval(() => {
            const mode = read(shared);
            if (mode === created.last) return;
            created.last = mode;
            created.listeners.forEach((fn) => fn(mode));
        }, POLL_MS);
        pollers.set(shared, created);
        poller = created;
    }
    poller.listeners.add(listener);
    listener(poller.last);
    return () => {
        poller!.listeners.delete(listener);
        if (poller!.listeners.size === 0) {
            clearInterval(poller!.timer);
            pollers.delete(shared);
        }
    };
}

/** The dock's current mode ("collapsed", "expanded", "closed", ...). */
export function useDockMode(shared: any): string | undefined {
    const [mode, setMode] = React.useState<string | undefined>(() => read(shared));
    React.useEffect(() => subscribeDockMode(shared, setMode), [shared]);
    return mode;
}
