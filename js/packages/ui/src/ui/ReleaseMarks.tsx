import type { Release } from "@wizeworks/lens-core/internal";
import { fmtDateTime } from "../format";

/** Markers drawn with labels; more than this and only the lines show. */
const MAX_LABELS = 6;

export interface ReleaseMarksProps {
  releases: readonly Release[];
  starts: readonly number[];
  /** X of a fractional bucket index. */
  at: (index: number) => number;
  top: number;
  base: number;
}

/** Where a time falls in the buckets, as a fractional index; null outside them. */
export function releaseIndex(starts: readonly number[], ms: number): number | null {
  if (starts.length < 2) return null;
  const size = starts[1]! - starts[0]!;
  const i = (ms - starts[0]!) / size;
  return i >= 0 && i < starts.length ? i : null;
}

/** Releases less than a bucket apart share one line, so services that ship together draw one marker. */
function groupsOf(releases: readonly Release[], starts: readonly number[]): { index: number; list: Release[] }[] {
  const placed = releases.flatMap((r) => {
    const i = releaseIndex(starts, r.firstMs);
    return i === null ? [] : [{ i, r }];
  });
  const out: { index: number; last: number; list: Release[] }[] = [];
  for (const { i, r } of placed.sort((a, b) => a.i - b.i)) {
    const g = out[out.length - 1];
    if (g && i - g.last < 1) {
      g.list.push(r);
      g.last = i;
    } else out.push({ index: i, last: i, list: [r] });
  }
  return out;
}

const labelOf = (list: readonly Release[]) => (list.length === 1 ? list[0]!.version : `${list.length} releases`);

/** A dashed line and the version at the time each release first sent data. */
export function ReleaseMarks({ releases, starts, at, top, base }: ReleaseMarksProps) {
  const groups = groupsOf(releases, starts);
  const labels = groups.length <= MAX_LABELS;
  return (
    <g className="wl-release-marks">
      {groups.map(({ index, list }) => {
        const x = at(index);
        return (
          <g key={index}>
            <title>{list.map((r) => `${r.service} ${r.version}, first seen ${fmtDateTime(r.firstMs)}`).join("\n")}</title>
            <line x1={x} x2={x} y1={top} y2={base} className="wl-release-line" />
            {labels && <text x={x + 4} y={top + 9} className="wl-release-label">{labelOf(list)}</text>}
          </g>
        );
      })}
    </g>
  );
}
