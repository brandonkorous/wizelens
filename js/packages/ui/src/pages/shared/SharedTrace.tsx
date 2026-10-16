import { useEffect, useState } from "react";
import { mergeTraces, type Trace } from "@wizeworks/lens-core";
import { apiFetch } from "../../data/api";
import { fmtDate } from "../../format";
import { Logo } from "../../shell/Logo";
import { Empty, Panel } from "../../ui/Panel";
import { TraceBody } from "../trace/TraceDetailPage";

/** A trace someone shared by link. No sign-in, no navigation: just this one trace. */
export function SharedTrace({ token }: { token: string }) {
  const [state, setState] = useState<{ trace: Trace; expiresMs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<{ trace: Trace; expiresMs: number }>(`./api/shared/${token}`).then(
      (s) => setState({ trace: mergeTraces(s.trace.traceId, [s.trace]), expiresMs: s.expiresMs }),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [token]);
  return (
    <div className="wl-shared">
      <header className="wl-shared-head">
        <span className="wl-brand-row">
          <Logo />
        </span>
        <span className="wl-muted wl-small">{state ? `Shared trace · link works until ${fmtDate(state.expiresMs)}` : "Shared trace"}</span>
      </header>
      <main className="wl-page">
        {state ? <TraceBody trace={state.trace} shared /> : <Panel><Empty title={error ? "This link does not work" : "Loading…"}>{error}</Empty></Panel>}
      </main>
    </div>
  );
}
