// Small math helpers for the SVG charts.

/** A round number at or above `max`, so the axis ends on a clean value. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

// For each top niceMax can pick, the step count that makes every step round (150 in 3 steps of 50, not 4 of 37.5).
const STEPS: Record<string, number> = { "1": 5, "1.5": 3, "2": 4, "2.5": 5, "3": 3, "4": 4, "5": 5, "6": 3, "8": 4, "10": 5 };

/** How many steps to cut a niceMax top into so each step is a round number. */
export function stepsOf(max: number): number {
  if (!(max > 0)) return 4;
  return STEPS[String(+(max / 10 ** Math.floor(Math.log10(max))).toFixed(2))] ?? 4;
}

/** Evenly spaced axis values from 0 to `max`, in round steps unless `count` is given. */
export const ticksOf = (max: number, count = stepsOf(max)): number[] => Array.from({ length: count + 1 }, (_, i) => (max / count) * i);

/** SVG path through the points, skipping gaps (null values). */
export function linePath(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** Closed areas under a line, for the soft fill: one per run of values, so a gap with no data stays empty, like the line. */
export function areaPath(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number, base: number): string {
  let d = "";
  let run: number[] = [];
  const close = () => {
    if (run.length > 1) d += `M${x(run[0]!).toFixed(1)},${base}${run.map((i) => `L${x(i).toFixed(1)},${y(values[i]!).toFixed(1)}`).join("")}L${x(run[run.length - 1]!).toFixed(1)},${base}Z`;
    run = [];
  };
  values.forEach((v, i) => (v === null ? close() : run.push(i)));
  close();
  return d;
}

export const maxOf = (lists: readonly (readonly (number | null)[])[]): number =>
  Math.max(0, ...lists.flatMap((l) => l.map((v) => v ?? 0)));
