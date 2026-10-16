import { Fragment } from "react";
import { browserTypeOf, isErrorSpan, type Span, type Trace } from "@wizeworks/lens-core";
import { fmtMs } from "./hud-model.js";
import { Empty } from "./panel-parts.js";
import type { RecordedRequest } from "./recorder-types.js";

type RowKind = "server" | "internal" | "db" | "client" | "messaging" | "browser" | "render" | "error";

export interface WfRow {
  key: string;
  name: string;
  startMs: number;
  durationMs: number;
  kind: RowKind;
  depth: number;
  /** Bar length. A query group's bar runs from its first start to its last end. */
  barMs: number;
}

const KIND: Record<Span["category"], RowKind> = {
  "http.server": "server",
  "http.client": "client",
  db: "db",
  messaging: "messaging",
  browser: "browser",
  internal: "internal",
};

const queries = (n: number) => (n === 1 ? "1 query" : `${n} queries`);

function depthOf(span: Span, byId: Map<string, Span>): number {
  let depth = 0;
  let parent = span.parentSpanId ? byId.get(span.parentSpanId) : undefined;
  while (parent && depth < 6) {
    depth++;
    parent = parent.parentSpanId ? byId.get(parent.parentSpanId) : undefined;
  }
  return depth;
}

function addSpan(rows: WfRow[], groups: Map<string, WfRow & { count: number }>, s: Span, byId: Map<string, Span>): void {
  const kind: RowKind = isErrorSpan(s) ? "error" : KIND[s.category];
  const row = { key: s.spanId, name: s.name, startMs: s.startMs, durationMs: s.durationMs, kind, depth: depthOf(s, byId), barMs: s.durationMs };
  if (s.category !== "db") return void rows.push(row);
  const id = `db:${s.parentSpanId ?? "root"}`;
  const g = groups.get(id);
  if (!g) {
    const first = { ...row, key: id, count: 1 };
    groups.set(id, first);
    return void rows.push(first);
  }
  g.count++;
  g.durationMs += s.durationMs;
  g.barMs = Math.max(g.barMs, s.startMs + s.durationMs - g.startMs);
  g.name = `${s.service} – ${queries(g.count)}`;
  if (kind === "error") g.kind = "error";
}

/** Rows for the request: browser call, server spans (queries grouped per parent), and the render after the response. */
export function waterfallRows(req: RecordedRequest, trace: Trace | null): WfRow[] {
  const spans = [...(trace?.spans ?? [])].filter((s) => browserTypeOf(s) !== "react").sort((a, b) => a.startMs - b.startMs);
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const rows: WfRow[] = [];
  if (!spans.some((s) => s.category === "browser") && req.durationMs !== null) {
    rows.push({ key: "browser", name: `fetch ${req.path}`, startMs: req.startMs, durationMs: req.durationMs, kind: "browser", depth: 0, barMs: req.durationMs });
  }
  const groups = new Map<string, WfRow & { count: number }>();
  for (const s of spans) addSpan(rows, groups, s, byId);
  if (req.durationMs !== null && req.renderMs !== null) {
    const startMs = req.startMs + req.durationMs;
    rows.push({ key: "render", name: "Render (read body, app code, paint)", startMs, durationMs: req.renderMs, kind: "render", depth: 0, barMs: req.renderMs });
  }
  return rows;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.001)));
  return ([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow) as number;
}

function ticksFor(total: number): number[] {
  const step = niceStep(total / 4);
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001 && ticks.length < 8; t += step) ticks.push(t);
  return ticks;
}

export function Waterfall({ rows: all, origin, limit }: { rows: WfRow[]; origin: number; limit: number }) {
  const rows = all.slice(0, limit);
  if (rows.length === 0) return <Empty>No timeline yet.</Empty>;
  const start = Math.min(origin, ...all.map((r) => r.startMs));
  const total = Math.max(1, ...all.map((r) => r.startMs + r.barMs - start));
  const ticks = ticksFor(total);
  const left = (ms: number) => `${(ms / total) * 100}%`;
  return (
    <div className="wl-wf">
      <div />
      <div />
      <div className="wl-wf-axis">
        {ticks.map((t) => (
          <span key={t} style={{ left: left(t) }}>
            {fmtMs(t)}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <Fragment key={r.key}>
          <div className="wl-wf-name" style={{ paddingLeft: r.depth * 10 }} title={`${r.name}\nstarts at +${fmtMs(r.startMs - start)}`}>
            <span>{r.name}</span>
          </div>
          <div className="wl-wf-at">{fmtMs(r.durationMs)}</div>
          <div className="wl-wf-track">
            {ticks.slice(1).map((t) => (
              <span key={t} className="wl-wf-grid" style={{ left: left(t) }} />
            ))}
            <i className={`wl-k-${r.kind}`} style={{ left: left(r.startMs - start), width: left(r.barMs) }} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
