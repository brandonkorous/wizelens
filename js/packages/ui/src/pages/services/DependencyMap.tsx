import type { ServiceEdge, ServiceRow } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { navigate, setQuery } from "../../routes";
import { Empty } from "../../ui/Panel";
import { KIND_ICON, serviceHref, statusTone } from "./serviceParts";

const NODE_W = 190;
const NODE_H = 46;
const COL_GAP = 110;
const ROW_GAP = 22;

interface Placed {
  row: ServiceRow;
  x: number;
  y: number;
}

/** Column of each node: the longest call chain that reaches it (callers on the left). */
function depths(rows: ServiceRow[], edges: ServiceEdge[]): Map<string, number> {
  const depth = new Map(rows.map((r) => [r.name, 0]));
  for (let pass = 0; pass < rows.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const next = (depth.get(e.from) ?? 0) + 1;
      if (e.from !== e.to && depth.has(e.to) && next > depth.get(e.to)! && next < rows.length) {
        depth.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

function layout(rows: ServiceRow[], edges: ServiceEdge[]): { nodes: Map<string, Placed>; width: number; height: number } {
  const depth = depths(rows, edges);
  const columns = new Map<number, ServiceRow[]>();
  for (const r of rows) columns.set(depth.get(r.name)!, [...(columns.get(depth.get(r.name)!) ?? []), r]);
  const nodes = new Map<string, Placed>();
  let tallest = 0;
  for (const [col, list] of columns) {
    tallest = Math.max(tallest, list.length);
    list.forEach((row, i) => nodes.set(row.name, { row, x: col * (NODE_W + COL_GAP), y: i * (NODE_H + ROW_GAP) }));
  }
  const cols = Math.max(1, ...[...columns.keys()].map((c) => c + 1));
  return { nodes, width: cols * NODE_W + (cols - 1) * COL_GAP, height: tallest * (NODE_H + ROW_GAP) - ROW_GAP };
}

function Edge({ edge, a, b }: { edge: ServiceEdge; a: Placed; b: Placed }) {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const mid = (x1 + x2) / 2;
  const rate = edge.calls ? (edge.errors / edge.calls) * 100 : 0;
  const label = [fmtCount(edge.calls), edge.p95Ms != null ? `p95 ${fmtMs(edge.p95Ms)}` : fmtMs(edge.avgMs), ...(edge.errors ? [`${fmtPct(rate)} failed`] : [])].join(" · ");
  return (
    <g className={edge.errors ? "wl-dep-edge wl-failing" : "wl-dep-edge"} onClick={() => navigate(serviceHref(edge.to))} role="link" aria-label={`Open ${edge.to}`}>
      <title>{`${edge.from} → ${edge.to}: ${label}`}</title>
      <path d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none" />
      <path className="wl-dep-hit" d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none" />
      <text x={mid} y={(y1 + y2) / 2 - 6} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function Node({ p, selected }: { p: Placed; selected: boolean }) {
  const Icon = KIND_ICON[p.row.kind];
  return (
    <g className={`wl-dep-node${selected ? " wl-selected" : ""}`} transform={`translate(${p.x},${p.y})`} onClick={() => setQuery({ service: p.row.key })} role="button" aria-label={`Show ${p.row.name}`}>
      <rect width={NODE_W} height={NODE_H} rx="10" />
      <foreignObject x="10" y="0" width={NODE_W - 20} height={NODE_H}>
        <div className="wl-dep-label">
          <Icon size={16} aria-hidden={true} />
          <span className="wl-truncate">{p.row.name}</span>
          <i className={`wl-dot wl-tone-${statusTone(p.row.status)}`} />
        </div>
      </foreignObject>
    </g>
  );
}

/** The whole stack as boxes and arrows: callers on the left, what they call on the right. */
export function DependencyMap({ rows, edges, selectedKey }: { rows: ServiceRow[]; edges: ServiceEdge[]; selectedKey: string | null }) {
  if (rows.length === 0) return <Empty>No calls recorded in this range.</Empty>;
  const { nodes, width, height } = layout(rows, edges);
  return (
    <div className="wl-dep-map">
      <svg width={width} height={height + 8} viewBox={`0 -4 ${width} ${height + 8}`} role="img" aria-label="Service dependency map">
        {edges.map((e) => {
          const a = nodes.get(e.from);
          const b = nodes.get(e.to);
          return a && b && a !== b ? <Edge key={`${e.from}→${e.to}`} edge={e} a={a} b={b} /> : null;
        })}
        {[...nodes.values()].map((p) => (
          <Node key={p.row.key} p={p} selected={p.row.key === selectedKey} />
        ))}
      </svg>
    </div>
  );
}
