// Show metric values in their unit: bytes, durations, ratios, and counts.

const BYTES = ["B", "KB", "MB", "GB", "TB"];

function num(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 100) return Math.round(v).toLocaleString("en-US");
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toPrecision(2);
}

function bytes(v: number): string {
  let i = 0;
  while (Math.abs(v) >= 1024 && i < BYTES.length - 1) (v /= 1024), i++;
  return `${num(v)} ${BYTES[i]}`;
}

function seconds(v: number): string {
  const a = Math.abs(v);
  if (a >= 60) return `${num(v / 60)} min`;
  if (a >= 1) return `${num(v)} s`;
  if (a >= 0.001 || a === 0) return `${num(v * 1000)} ms`;
  return `${num(v * 1e6)} µs`;
}

/** "{request}" → "request". */
const curly = (unit: string) => unit.replace(/\{([^}]*)\}/g, (_, word: string) => word.replace(/_/g, " "));

/** A value in its UCUM unit. Ratios ("1", "s/s") show as percent. */
export function fmtMetric(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  if (unit === "1" || unit === "s/s" || unit === "%") return `${num(unit === "%" ? value : value * 100)}%`;
  if (unit === "By") return bytes(value);
  if (unit === "By/s") return `${bytes(value)}/s`;
  if (unit === "s") return seconds(value);
  if (unit === "ms") return seconds(value / 1000);
  if (unit === "us" || unit === "µs") return seconds(value / 1e6);
  if (unit === "ns") return seconds(value / 1e9);
  if (unit === "/s") return `${num(value)}/s`;
  const u = curly(unit);
  const n = Number.isInteger(value) ? value.toLocaleString("en-US") : num(value);
  const word = /^\{[^}]*\}(\/s)?$/.test(unit);
  return u ? `${n} ${value === 1 || !word ? u : plural(u)}` : n;
}

/** "work item" → "work items", "request/s" → "requests/s"; a word that ends in s, or is not a word, stays. */
const plural = (u: string) => u.replace(/^([a-z ]*[a-rt-z])(?=$|\/)/i, "$1s");

/** The area a metric belongs to, from its name, for grouping the list. */
export type MetricArea = "runtime" | "http" | "database" | "messaging" | "rpc" | "custom";

const AREAS: [RegExp, MetricArea][] = [
  [/^(process|system|v8js|nodejs|dotnet|jvm|go|python|cpython|container)\./, "runtime"],
  [/^(http|kestrel|aspnetcore|signalr|url)\./, "http"],
  [/^db\./, "database"],
  [/^messaging\./, "messaging"],
  [/^rpc\./, "rpc"],
];

/** The order of areas in the list: the runtime first, the app's own metrics last. */
export const METRIC_AREAS: readonly MetricArea[] = ["runtime", "http", "database", "messaging", "rpc", "custom"];

export const metricAreaOf = (name: string): MetricArea => AREAS.find(([re]) => re.test(name))?.[1] ?? "custom";
