import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useData } from "./provider";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  reload: () => void;
}

const REFRESH_MS = 30_000;

/** GET a JSON value, again every 30 seconds while the page is open, and on `reload()`. Null url waits. */
export function useApi<T>(url: string | null): ApiState<T> {
  const { updatedMs } = useData();
  const tick = Math.floor(updatedMs / REFRESH_MS);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let live = true;
    apiFetch<T>(url).then(
      (data) => live && setState({ data, error: null }),
      (e: unknown) => live && setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) })),
    );
    return () => void (live = false);
  }, [url, tick, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Run a change, then reload; returns the error message or null. */
export async function act(run: () => Promise<unknown>, reload: () => void): Promise<string | null> {
  try {
    await run();
    reload();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
