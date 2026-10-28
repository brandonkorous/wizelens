import type { ServiceEdge, ServiceRow } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { navigate, setQuery } from "../../routes";
import { Empty } from "../../ui/Panel";
import { KIND_ICON, serviceHref, statusTone } from "./serviceParts";
import { pressable } from "../../ui/pressable";

const NODE_W = 190;
const NODE_H = 46;
const MIN_GAP = 110;
const ROW_GAP = 22;
// Label width per character at 11px, rounded up; and the space between two stacked labels.
const CHAR_W = 6;
const LINE_H = 14;

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

function edgeLabel(edge: ServiceEdge): string {
  const rate = edge.calls ? (edge.errors / edge.calls) * 100 : 0;
  return [fmtCount(edge.calls), edge.p95Ms != null ? `p95 ${fmtMs(edge.p95Ms)}` : fmtMs(edge.avgMs), ...(edge.errors ? [`${fmtPct(rate)} failed`] : [])].join(" · ");
}

/** Space between columns: wide enough for the longest label, so no label runs under a box. */
function colGap(edges: ServiceEdge[]): number {
  return Math.max(MIN_GAP, ...edges.map((e) => edgeLabel(e).length * CHAR_W + 24));
}

/** A call that skips a column runs in its own lane under the boxes it passes, so no box hides it. */
function detours(edges: ServiceEdge[], nodes: Map<string, Placed>, gap: number): Map<ServiceEdge, number> {
  const lanes = new Map<ServiceEdge, number>();
  for (const e of edges) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b || b.x - a.x <= NODE_W + gap) continue;
    const under = [...nodes.values()].filter((p) => p.x > a.x && p.x < b.x).map((p) => p.y + NODE_H);
    lanes.set(e, Math.max(...under) + 14 + lanes.size * 2 * LINE_H);
  }
  return lanes;
}

/** Where each label sits: the middle of its curve, pushed down when another label in the same gap is there. */
function labelYs(edges: ServiceEdge[], nodes: Map<string, Placed>, lanes: Map<ServiceEdge, number>): Map<ServiceEdge, number> {
  const wanted = edges.flatMap((e) => {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b || a === b) return [];
    const lane = lanes.get(e);
    return [{ e, gap: lane != null ? -lane : a.x + b.x, y: lane != null ? lane + LINE_H : (a.y + b.y + NODE_H) / 2 - 6, from: a.y }];
  });
  // Two lines that cross share a middle: the upper label is the line from the upper box.
  wanted.sort((p, q) => p.gap - q.gap || p.y - q.y || p.from - q.from);
  const ys = new Map<ServiceEdge, number>();
  let last = { gap: NaN, y: 0 };
  for (const w of wanted) {
    const y = w.gap === last.gap ? Math.max(w.y, last.y + LINE_H) : w.y;
    ys.set(w.e, y);
    last = { gap: w.gap, y };
  }
  return ys;
}

function layout(rows: ServiceRow[], edges: ServiceEdge[], gap: number): { nodes: Map<string, Placed>; width: number; height: number } {
  const depth = depths(rows, edges);
  const columns = new Map<number, ServiceRow[]>();
  for (const r of rows) columns.set(depth.get(r.name)!, [...(columns.get(depth.get(r.name)!) ?? []), r]);
  const nodes = new Map<string, Placed>();
  let tallest = 0;
  for (const [col, list] of columns) {
    tallest = Math.max(tallest, list.length);
    list.forEach((row, i) => nodes.set(row.name, { row, x: col * (NODE_W + gap), y: i * (NODE_H + ROW_GAP) }));
  }
  const cols = Math.max(1, ...[...columns.keys()].map((c) => c + 1));
  return { nodes, width: cols * NODE_W + (cols - 1) * gap, height: tallest * (NODE_H + ROW_GAP) - ROW_GAP };
}

/** The line's path: one curve to the next column, or down into its lane, along it, and up into the far box. */
function curve(a: Placed, b: Placed, lane: number | undefined, gap: number): string {
  const [x1, y1, x2, y2] = [a.x + NODE_W, a.y + NODE_H / 2, b.x, b.y + NODE_H / 2];
  if (lane == null) return `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const h = gap / 2;
  return `M${x1},${y1} C${x1 + h},${y1} ${x1 + h},${lane} ${x1 + gap},${lane} L${x2 - gap},${lane} C${x2 - h},${lane} ${x2 - h},${y2} ${x2},${y2}`;
}

function Edge({ edge, d }: { edge: ServiceEdge; d: string }) {
  const label = edgeLabel(edge);
  return (
    <g className={edge.errors ? "wl-dep-edge wl-failing" : "wl-dep-edge"} {...pressable(() => navigate(serviceHref(edge.to)), "link")} aria-label={`Open ${edge.to}`}>
      <title>{`${edge.from} → ${edge.to}: ${label}`}</title>
      <path d={d} fill="none" />
      <path className="wl-dep-hit" d={d} fill="none" />
    </g>
  );
}

/** One line's numbers on a small box in the panel color, drawn after every line so none runs through it. */
function EdgeLabel({ edge, a, b, y }: { edge: ServiceEdge; a: Placed; b: Placed; y: number }) {
  const label = edgeLabel(edge);
  const mid = (a.x + NODE_W + b.x) / 2;
  const w = label.length * CHAR_W + 6;
  return (
    <g className="wl-dep-label-box" aria-hidden="true">
      <rect x={mid - w / 2} y={y - 10} width={w} height={13} rx="3" />
      <text x={mid} y={y} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function Node({ p, selected }: { p: Placed; selected: boolean }) {
  const Icon = KIND_ICON[p.row.kind];
  return (
    <g className={`wl-dep-node${selected ? " wl-selected" : ""}`} transform={`translate(${p.x},${p.y})`} {...pressable(() => setQuery({ service: p.row.key }), "button")} aria-label={`Show ${p.row.name}`}>
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
  const gap = colGap(edges);
  const { nodes, width, height: boxes } = layout(rows, edges, gap);
  const lanes = detours(edges, nodes, gap);
  const ys = labelYs(edges, nodes, lanes);
  const height = Math.max(boxes, ...[...ys.values()].map((y) => y + 4));
  return (
    <div className="wl-dep-map">
      <svg width={width} height={height + 8} viewBox={`0 -4 ${width} ${height + 8}`} role="img" aria-label="Service dependency map">
        {edges.map((e) => {
          const a = nodes.get(e.from);
          const b = nodes.get(e.to);
          return a && b && a !== b ? <Edge key={`${e.from}→${e.to}`} edge={e} d={curve(a, b, lanes.get(e), gap)} /> : null;
        })}
        {edges.map((e) => (ys.has(e) ? <EdgeLabel key={`${e.from}→${e.to}`} edge={e} a={nodes.get(e.from)!} b={nodes.get(e.to)!} y={ys.get(e)!} /> : null))}
        {[...nodes.values()].map((p) => (
          <Node key={p.row.key} p={p} selected={p.row.key === selectedKey} />
        ))}
      </svg>
    </div>
  );
}
