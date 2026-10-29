import { GitCompare } from "lucide-react";
import { browserTypeOf, selfTimes, type Trace, traceTiming } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, shortId } from "../../format";
import { traceHref } from "../../routes";
import { DetailHead } from "../../ui/DetailHead";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { useTrace } from "./useTrace";
import { Waterfall } from "./Waterfall";

interface Line {
  label: string;
  a: number;
  b: number;
  ms: boolean;
}

/** A trace that starts with a browser call counts its render in Total (core traceTiming), so the label says so. */
const fromBrowser = (t: Trace) => t.spans.some((s) => browserTypeOf(s) === "fetch");

function linesOf(a: Trace, b: Trace): Line[] {
  const [ta, tb] = [traceTiming(a), traceTiming(b)];
  return [
    { label: fromBrowser(a) || fromBrowser(b) ? "Total (call + render)" : "Total", a: ta.totalMs, b: tb.totalMs, ms: true },
    { label: "Server", a: ta.serverMs ?? 0, b: tb.serverMs ?? 0, ms: true },
    { label: "Database", a: ta.dbMs, b: tb.dbMs, ms: true },
    { label: "Render", a: ta.renderMs ?? 0, b: tb.renderMs ?? 0, ms: true },
    { label: "Spans", a: a.spanCount, b: b.spanCount, ms: false },
    { label: "Queries", a: a.dbCount, b: b.dbCount, ms: false },
    { label: "HTTP calls out", a: a.httpClientCount, b: b.httpClientCount, ms: false },
    { label: "Errors", a: a.errorCount, b: b.errorCount, ms: false },
  ];
}

/** Self time per service, so a slower service stands out. */
function serviceLines(a: Trace, b: Trace): Line[] {
  const per = (t: Trace) => {
    const self = selfTimes(t);
    const out = new Map<string, number>();
    for (const s of t.spans) out.set(s.service, (out.get(s.service) ?? 0) + (self.get(s.spanId) ?? 0));
    return out;
  };
  const [pa, pb] = [per(a), per(b)];
  return [...new Set([...pa.keys(), ...pb.keys()])].map((s) => ({ label: s, a: pa.get(s) ?? 0, b: pb.get(s) ?? 0, ms: true })).sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a));
}

const fmt = (l: Line, v: number) => (l.ms ? fmtMs(v) : fmtCount(v));

function Diff({ l }: { l: Line }) {
  const d = l.b - l.a;
  if (Math.abs(d) < (l.ms ? 0.5 : 1)) return <span className="wl-muted">same</span>;
  return <span className={d > 0 ? "wl-text-error" : "wl-text-ok"}>{d > 0 ? "+" : "−"}{fmt(l, Math.abs(d))}</span>;
}

const columns = (a: Trace, b: Trace, first: string): Column<Line>[] => [
  { key: "label", header: first, cell: (l) => l.label },
  { key: "a", label: `A · ${shortId(a.traceId)}`, header: <>A<span className="wl-cmp-id"> · {shortId(a.traceId)}</span></>, num: true, cell: (l) => fmt(l, l.a) },
  { key: "b", label: `B · ${shortId(b.traceId)}`, header: <>B<span className="wl-cmp-id"> · {shortId(b.traceId)}</span></>, num: true, cell: (l) => fmt(l, l.b) },
  { key: "diff", header: "B − A", num: true, cell: (l) => <Diff l={l} /> },
];

function Side({ trace, label }: { trace: Trace; label: string }) {
  return (
    <Panel title={`${label}: ${trace.rootName}`} action={<ViewAll href={traceHref(trace.traceId)} label="Open trace" />}>
      <div className="wl-table-wrap">
        <Waterfall trace={trace} selected={null} highlight={new Set()} onSelect={() => {}} />
      </div>
    </Panel>
  );
}

/** Two traces side by side: their numbers, time per service, and both waterfalls. */
export function TraceCompare({ a, b }: { a: string; b: string }) {
  const ta = useTrace(a);
  const tb = useTrace(b);
  const head = <DetailHead back={[traceHref(a), "Back to trace"]} icon={GitCompare} title="Compare traces" stats={[["A", shortId(a)], ["B", shortId(b)]]} />;
  if (!ta.trace || !tb.trace) return <div className="wl-dpage">{head}<Panel><Empty>{ta.error ?? tb.error ?? "Loading traces…"}</Empty></Panel></div>;
  return (
    <div className="wl-dpage">
      {head}
      <div className="wl-grid wl-grid-2-even">
        <Panel title="Numbers" flush><Table narrow columns={columns(ta.trace, tb.trace, "")} rows={linesOf(ta.trace, tb.trace)} rowKey={(l) => l.label} /></Panel>
        <Panel title="Self Time per Service" flush><Table narrow paging={{ noun: "services", key: "services" }} columns={columns(ta.trace, tb.trace, "Service")} rows={serviceLines(ta.trace, tb.trace)} rowKey={(l) => l.label} /></Panel>
      </div>
      <Side trace={ta.trace} label="A" />
      <Side trace={tb.trace} label="B" />
    </div>
  );
}
