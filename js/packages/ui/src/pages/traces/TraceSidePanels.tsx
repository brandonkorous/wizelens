import { useState } from "react";
import type { Bottleneck, CriticalSpan, LayerKind } from "@wizeworks/lens-core";
import { fmtMs, fmtPct, serviceSlot } from "../../format";
import { navigate, traceHref } from "../../routes";
import { BarList } from "../../ui/BarList";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { Table } from "../../ui/Table";

const LAYER_COLOR: Record<LayerKind | "owner", string> = {
  browser: "var(--wl-blue)",
  network: "#93c5fd",
  routing: "var(--wl-violet)",
  handler: "var(--wl-green)",
  service: "var(--wl-blue)",
  queue: "var(--wl-violet)",
  database: "var(--wl-k-db)",
  external: "var(--wl-k-client)",
  render: "#38bdf8",
  owner: "var(--wl-blue)",
};

type By = "layer" | "service";

const SLOW_SPAN_MS = 100;

/** Share of time per layer (or per service) over every trace in the range. */
export function BottleneckPanel({ data }: { data: Record<By, Bottleneck[]> }) {
  const [by, setBy] = useState<By>("layer");
  const rows = data[by];
  const names = rows.map((r) => r.key);
  const items = rows.map((r) => ({
    key: r.key,
    label: <span className="wl-dot-text"><i className="wl-dot" style={{ background: color(r.kind, r.key, names) }} />{r.label}</span>,
    value: r.totalMs,
    share: fmtPct(r.share),
    display: fmtMs(r.totalMs),
    color: color(r.kind, r.key, names),
  }));
  const action = <Select small label="Group by" value={by} options={[["layer", "By layer"], ["service", "By service"]]} onChange={setBy} />;
  return (
    <Panel title="Bottleneck Distribution" action={action}>
      {items.length === 0 ? <Empty>No timed spans in this range.</Empty> : <BarList compact items={items} />}
    </Panel>
  );
}

function color(kind: LayerKind | "owner", key: string, names: string[]): string {
  return kind === "owner" ? `var(--wl-s${serviceSlot(key, names)})` : LAYER_COLOR[kind];
}

/** The slowest spans below the request roots. */
export function CriticalSpansPanel({ critical }: { critical: readonly CriticalSpan[] }) {
  const services = [...new Set(critical.map((s) => s.service))];
  return (
    <Panel title="Critical Spans">
      <Table
        paging={{ noun: "spans", key: "critical", size: 6 }}
        rows={critical}
        rowKey={(s) => `${s.traceId}:${s.spanId}`}
        onRowClick={(s) => navigate(traceHref(s.traceId))}
        empty={<Empty>No spans below the request roots yet.</Empty>}
        columns={[
          { key: "span", header: "Span", cell: (s) => <span className="wl-mono wl-small">{s.name}</span>, className: "wl-wrap" },
          { key: "service", header: "Service", cell: (s) => <span className="wl-dot-text"><i className="wl-dot" style={{ background: `var(--wl-s${serviceSlot(s.service, services)})` }} />{s.layer === s.service ? s.service : `${s.service} · ${s.layer}`}</span> },
          { key: "ms", header: "Duration", num: true, cell: (s) => <span className={s.durationMs >= SLOW_SPAN_MS ? "wl-text-tone-danger" : "wl-text-tone-warning"}>{fmtMs(s.durationMs)}</span> },
        ]}
      />
    </Panel>
  );
}
