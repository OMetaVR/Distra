import { useCallback, useEffect, useState } from "react";

/** Runs `load` on mount; `reload` runs it again. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
    const [state, setState] = useState<{ value?: T; error?: unknown; loading: boolean }>({ loading: true });

    const reload = useCallback(() => {
        let cancelled = false;
        setState(previous => ({ ...previous, loading: true }));
        load().then(
            value => !cancelled && setState({ value, loading: false }),
            error => !cancelled && setState({ error, loading: false }),
        );
        return () => void (cancelled = true);
    }, deps);

    useEffect(reload, [reload]);
    return { ...state, reload };
}
