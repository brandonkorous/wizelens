import { fmtDateTime } from "../format";

/** A time a thing was down, drawn as a red band across the chart. */
export interface ChartOutage {
  startMs: number;
  /** Null while it is still down. */
  endMs: number | null;
  label: string;
}

export interface OutageBandsProps {
  outages: readonly ChartOutage[];
  starts: readonly number[];
  /** X of a fractional bucket index. */
  at: (index: number) => number;
  top: number;
  base: number;
}

/** Where a time falls in the buckets, as a fractional index held inside them. */
function clampedIndex(starts: readonly number[], ms: number): number {
  const size = starts[1]! - starts[0]!;
  return Math.min(starts.length, Math.max(0, (ms - starts[0]!) / size));
}

/** A band per outage, at least 3 px wide so a two-minute outage still shows on a 30-day chart. */
export function OutageBands({ outages, starts, at, top, base }: OutageBandsProps) {
  if (starts.length < 2 || outages.length === 0) return null;
  return (
    <g className="wl-outage-bands">
      {outages.map((o) => {
        const x1 = at(clampedIndex(starts, o.startMs));
        const x2 = at(clampedIndex(starts, o.endMs ?? Date.now()));
        return (
          <g key={`${o.label}-${o.startMs}`}>
            <title>{`${o.label}: down ${fmtDateTime(o.startMs)}${o.endMs === null ? ", still down" : ` to ${fmtDateTime(o.endMs)}`}`}</title>
            <rect className="wl-outage-band" x={Math.min(x1, x2 - 3)} y={top} width={Math.max(3, x2 - x1)} height={base - top} />
          </g>
        );
      })}
    </g>
  );
}
