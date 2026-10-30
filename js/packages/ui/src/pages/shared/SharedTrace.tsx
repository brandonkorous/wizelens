import { type MouseEvent, useEffect, useState } from "react";
import { mergeTraces, type Trace } from "@wizeworks/lens-core/internal";
import { apiFetch } from "../../data/api";
import { fmtDate, fmtDateTime } from "../../format";
import { Logo } from "../../shell/Logo";
import { Empty, Panel } from "../../ui/Panel";
import { TraceBody } from "../trace/TraceDetailPage";
import { SharedPage } from "./SharedPage";

/** A link into the app would ask the reader to sign in: on a shared page it does nothing. */
const stayHere = (e: MouseEvent) => {
  if (e.target instanceof Element && e.target.closest('a[href^="#/"]')) e.preventDefault();
};

type Link = { trace: Trace; expiresMs: number } | { page: string; title: string; params: Record<string, string>; model: unknown; createdMs: number; expiresMs: number };

/** What a share link shows: one trace, or one page as it was when the link was made. No sign-in, no navigation. */
export function SharedTrace({ token }: { token: string }) {
  const [state, setState] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<Link>(`./api/shared/${token}`).then(
      (s) => setState("trace" in s ? { trace: mergeTraces(s.trace.traceId, [s.trace]), expiresMs: s.expiresMs } : s),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [token]);
  const what = !state ? "Shared link" : "trace" in state ? "Shared trace" : `${state.title} · as of ${fmtDateTime(state.createdMs)}`;
  return (
    <div className="wl-shared">
      <header className="wl-shared-head">
        <span className="wl-brand-row">
          <Logo />
        </span>
        <span className="wl-muted wl-small">{state ? `${what} · link works until ${fmtDate(state.expiresMs)}` : what}</span>
      </header>
      <main className="wl-page" onClickCapture={stayHere}>
        {!state ? <Panel><Empty title={error ? "This link does not work" : "Loading…"}>{error}</Empty></Panel> : "trace" in state ? <TraceBody trace={state.trace} shared /> : <SharedPage page={state.page} params={state.params} model={state.model} />}
      </main>
    </div>
  );
}
