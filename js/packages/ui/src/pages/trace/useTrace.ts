import { useCallback, useEffect, useState } from "react";
import type { Trace } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { provider } from "../../data/provider";

export interface TraceState {
  trace: Trace | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

const LATE_SPANS_MS = 1500;

/** Load one trace merged across services; show the dashboard's copy while it loads. */
export function useTrace(traceId: string): TraceState {
  const data = useData();
  const [loaded, setLoaded] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(() => {
    setLoading(true);
    provider.loadTrace(traceId)
      .then((t) => (setLoaded(t), setError(null)))
      .catch((e: unknown) => setError(String(e).includes("not-found") ? "This trace is not in this project, or it is no longer stored." : String(e)))
      .finally(() => setLoading(false));
  }, [traceId]);
  useEffect(() => {
    setLoaded(null);
    reload();
    // Browser spans and downstream services can land a moment later, so load once more.
    const id = setTimeout(reload, LATE_SPANS_MS);
    return () => clearTimeout(id);
  }, [reload]);
  const cached = data.traces.find((t) => t.traceId === traceId) ?? null;
  const trace = loaded && (!cached || loaded.spanCount >= cached.spanCount) ? loaded : cached;
  return { trace, error: trace ? null : error, loading, reload };
}
