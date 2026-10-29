import { displayService, errorInfo, errorText, isErrorSpan, requestRows, type Trace } from "@wizeworks/lens-core";
import { fmtMs } from "../format";
import { hrefTo, type PageId, traceHref } from "../routes";

export type HitKind = "page" | "request" | "trace" | "error" | "service" | "log" | "search" | "query" | "insight" | "security" | "metric" | "alert" | "slo" | "saved";

export interface SearchHit {
  key: string;
  kind: HitKind;
  title: string;
  detail: string;
  href: string;
}

const LIMIT = 6;

const has = (text: string, q: string) => text.toLowerCase().includes(q);

function requestHits(traces: readonly Trace[], q: string): SearchHit[] {
  const out: SearchHit[] = [];
  for (const r of requestRows(traces)) {
    if (out.length >= LIMIT) break;
    if (r.traceId.startsWith(q)) out.push({ key: `t${r.traceId}`, kind: "trace", title: r.traceId, detail: `${r.method} ${r.path}`, href: traceHref(r.traceId) });
    else if (has(r.path, q) || has(r.endpoint, q))
      out.push({ key: `r${r.traceId}`, kind: "request", title: `${r.method} ${r.path}`, detail: `${r.status ?? "…"} · ${fmtMs(r.durationMs)} · ${r.service}`, href: hrefTo("requests", [], { trace: r.traceId }) });
  }
  return out;
}

function errorHits(traces: readonly Trace[], q: string): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const t of traces) {
    for (const s of t.spans.filter(isErrorSpan)) {
      const e = errorInfo(s);
      const text = `${e.type ?? ""}: ${e.message}`;
      if (seen.has(text) || !has(text, q)) continue;
      seen.add(text);
      out.push({ key: `e${text}`, kind: "error", title: errorText(e), detail: `${e.service} · ${t.rootName}`, href: traceHref(t.traceId, "errors") });
      if (out.length >= LIMIT) return out;
    }
  }
  return out;
}

function serviceHits(traces: readonly Trace[], q: string): SearchHit[] {
  const names = new Set<string>();
  for (const t of traces) for (const s of t.services) if (has(s, q)) names.add(s);
  return [...names].slice(0, LIMIT).map((s) => ({ key: `s${s}`, kind: "service" as const, title: s, detail: "Service", href: hrefTo("services", [encodeURIComponent(displayService(s))]) }));
}

/** Search pages, requests, trace ids, errors, and services in the loaded traces. `server` leaves requests to the host's search. */
export function search(traces: readonly Trace[], pages: { page: PageId; label: string }[], query: string, server = false): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages.map((p) => ({ key: `p${p.page}`, kind: "page", title: p.label, detail: "Go to page", href: hrefTo(p.page) }));
  const pageHits = pages.filter((p) => has(p.label, q)).map((p) => ({ key: `p${p.page}`, kind: "page" as const, title: p.label, detail: "Go to page", href: hrefTo(p.page) }));
  return [...pageHits, ...(server ? [] : requestHits(traces, q)), ...errorHits(traces, q), ...serviceHits(traces, q)];
}
