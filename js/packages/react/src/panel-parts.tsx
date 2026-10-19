import { type ReactNode, useEffect, useState } from "react";
import type { Trace, TraceView } from "@wizeworks/lens-core";
import type { RecordedRequest, Recorder, RequestView } from "@wizeworks/lens-browser";
import { IconClose, IconExternal } from "./icons.js";

/** The HUD shows small panels only. The full detail is the dashboard, in a new tab. */
export type Panel = "details" | "settings";

export const isPanel = (v: string): v is Panel => v === "details" || v === "settings";

/** Dashboard link for the request: one part of its trace page, or the request list when the server has no trace. */
export function dashboardLink(recorder: Recorder, req: RecordedRequest | null, view?: TraceView): string {
  return req?.profiled ? recorder.traceLink(req.traceId, view) : `${recorder.endpointUrl}/`;
}

/** Load the full trace of the request on screen. Late spans land after the response, so load twice. */
export function useTrace(recorder: Recorder, req: RecordedRequest | null): Trace | null {
  const traceId = req?.profiled && req.durationMs !== null ? req.traceId : null;
  const [trace, setTrace] = useState<Trace | null>(() => (traceId ? recorder.getTrace(traceId) : null));
  useEffect(() => {
    if (!traceId) {
      setTrace(null);
      return;
    }
    let cancelled = false;
    setTrace(recorder.getTrace(traceId));
    const load = () => void recorder.loadTrace(traceId).then((t) => !cancelled && setTrace(t));
    load();
    const again = setTimeout(load, 2500);
    return () => {
      cancelled = true;
      clearTimeout(again);
    };
  }, [recorder, traceId]);
  return trace;
}

export function statusPill(req: RecordedRequest | null, view: RequestView): { cls: string; text: string } {
  if (!req) return { cls: "wl-p-none", text: "—" };
  if (req.status === null) return req.error ? { cls: "wl-p-err", text: "ERR" } : { cls: "wl-p-info", text: "…" };
  if (view.health === "info") return { cls: "wl-p-info", text: String(req.status) };
  return { cls: req.status >= 500 ? "wl-p-err" : req.status >= 400 ? "wl-p-warn" : "wl-p-ok", text: String(req.status) };
}

export function StackBar({ view, large = false, failed = false }: { view: RequestView; large?: boolean; failed?: boolean }) {
  const s = view.segments;
  const total = view.totalMs || 1;
  const w = (v: number) => ({ width: `${(v / total) * 100}%` });
  return (
    <div className={`wl-bar${large ? " wl-bar-lg" : ""}`} aria-hidden="true">
      {s && (
        <>
          <i className={failed ? "wl-c-error" : "wl-c-server"} style={w(s.server)} />
          <i className="wl-c-db" style={w(s.db)} />
          <i className="wl-c-render" style={w(s.render)} />
          <i className="wl-c-other" style={w(s.other)} />
        </>
      )}
    </div>
  );
}

/** Opens the dashboard in a new tab. */
export function DashLink({ href, children, className = "wl-more" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children} <IconExternal size={12} />
    </a>
  );
}

export function PanelBar({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="wl-panel-bar">
      {children}
      <span className="wl-spacer" />
      <button type="button" className="wl-panel-x" onClick={onClose} aria-label="Close" title="Close (Esc)">
        <IconClose />
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="wl-empty">{children}</div>;
}

export function NoServerData({ req }: { req: RecordedRequest | null }) {
  if (!req) return <Empty>No requests yet. Use your app and they show up here.</Empty>;
  if (req.durationMs === null) return <Empty>The request is still running…</Empty>;
  if (!req.profiled) return <Empty>No server data. The server did not answer with an X-WizeLens-Trace header.</Empty>;
  return <Empty>Loading the trace…</Empty>;
}
