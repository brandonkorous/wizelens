// Small math helpers for the SVG charts.

/** A round number at or above `max`, so the axis ends on a clean value. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

/** Evenly spaced axis values from 0 to `max`. */
export const ticksOf = (max: number, count = 4): number[] => Array.from({ length: count + 1 }, (_, i) => (max / count) * i);

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

/** Closed area under a line, for the soft fill. Gaps count as zero. */
export function areaPath(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number, base: number): string {
  if (values.length === 0) return "";
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v ?? 0).toFixed(1)}`);
  return `M${x(0).toFixed(1)},${base}L${pts.join("L")}L${x(values.length - 1).toFixed(1)},${base}Z`;
}

export const maxOf = (lists: readonly (readonly (number | null)[])[]): number =>
  Math.max(0, ...lists.flatMap((l) => l.map((v) => v ?? 0)));
