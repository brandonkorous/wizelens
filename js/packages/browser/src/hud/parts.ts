import type { Trace, TraceView } from "@wizeworks/lens-core/internal";
import { dashboardOf } from "../cloud.js";
import type { RequestView } from "../hud-model.js";
import type { RecordedRequest, Recorder } from "../recorder-types.js";
import { type Child, h } from "./dom.js";
import { iconClose, iconExternal } from "./icons.js";

/** Dashboard link for the request: one part of its trace page, or the request list when the server has no trace. */
export function dashboardLink(recorder: Recorder, req: RecordedRequest | null, view?: TraceView): string {
  return req?.profiled ? recorder.traceLink(req.traceId, view) : dashboardOf(recorder.endpointUrl);
}

/** The trace id to load for the details panel: a finished request the server profiled. */
export const traceIdOf = (req: RecordedRequest | null): string | null => (req?.profiled && req.durationMs !== null ? req.traceId : null);

/** Load the full trace of the request on screen. Late spans land after the response, so load twice. Returns a stop function. */
export function watchTrace(recorder: Recorder, traceId: string, onTrace: (t: Trace | null) => void): () => void {
  let cancelled = false;
  onTrace(recorder.getTrace(traceId));
  const load = () => void recorder.loadTrace(traceId).then((t) => !cancelled && onTrace(t));
  load();
  const again = setTimeout(load, 2500);
  return () => {
    cancelled = true;
    clearTimeout(again);
  };
}

export function statusPill(req: RecordedRequest | null, view: RequestView): { cls: string; text: string } {
  if (!req) return { cls: "wl-p-none", text: "—" };
  if (req.status === null) return req.error ? { cls: "wl-p-err", text: "ERR" } : { cls: "wl-p-info", text: "…" };
  if (view.health === "info") return { cls: "wl-p-info", text: String(req.status) };
  return { cls: req.status >= 500 ? "wl-p-err" : req.status >= 400 ? "wl-p-warn" : "wl-p-ok", text: String(req.status) };
}

/** A `width` style for `part` of `total`. */
export const widthOf = (part: number, total: number) => `width:${(part / total) * 100}%`;

export function stackBar(view: RequestView, large = false, failed = false): HTMLElement {
  const s = view.segments;
  const total = view.totalMs || 1;
  const seg = (cls: string, ms: number) => h("i", { class: cls, style: widthOf(ms, total) });
  return h(
    "div",
    { class: `wl-bar${large ? " wl-bar-lg" : ""}`, "aria-hidden": "true" },
    s && [seg(failed ? "wl-c-error" : "wl-c-server", s.server), seg("wl-c-db", s.db), seg("wl-c-render", s.render), seg("wl-c-other", s.other)],
  );
}

/** Opens the dashboard in a new tab. */
export function dashLink(href: string, children: Child, className = "wl-more"): HTMLElement {
  return h("a", { class: className, href, target: "_blank", rel: "noreferrer" }, children, " ", iconExternal(12));
}

export function panelBar(onClose: () => void, ...children: Child[]): HTMLElement {
  const close = h("button", { type: "button", class: "wl-panel-x", onClick: onClose, "aria-label": "Close", title: "Close (Esc)" }, iconClose());
  return h("div", { class: "wl-panel-bar" }, children, h("span", { class: "wl-spacer" }), close);
}

export const empty = (text: string) => h("div", { class: "wl-empty" }, text);
