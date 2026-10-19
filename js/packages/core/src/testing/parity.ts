// Parity helpers: today's pages (memory executor) against the frozen legacy models. Test-only: excluded from the build.
import { isLooseTraceId } from "../loose.js";
import { type ModelOf, type PageName, runPageSync } from "../models/index.js";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import type { TimeRange } from "../stats/common.js";
import * as legacy from "./legacy/index.js";
import { normalizeModel } from "./parity-normalize.js";
import { SCENARIO_NOW, scenarioTraces } from "./scenario.js";

export const PARITY_RANGES: readonly TimeRange[] = ["15m", "1h", "24h", "7d"];

const traces = scenarioTraces();
const ex = memoryExecutor(traces);

export type LegacyPage = keyof typeof legacy.PAGE_MODELS;

/** The page from the memory executor. */
export const newModel = <P extends PageName>(page: P, range: TimeRange, params: Record<string, string> = {}): ModelOf<P> => runPageSync(page, pageContext(range, SCENARIO_NOW, params), ex);

/** The page from the legacy model over the same traces. */
export function legacyModel(page: LegacyPage, range: TimeRange, params: Record<string, string> = {}): unknown {
  // Lines outside a request (loose traces) are not traces to list or count; the legacy Traces page predates them.
  const input = page === "traces" ? traces.filter((t) => !isLooseTraceId(t.traceId)) : traces;
  return legacy.PAGE_MODELS[page](legacy.modelInput(input, range, SCENARIO_NOW, { slowQueryMs: 100 }, params));
}

// Percentiles come from a histogram, so they may differ by its error.
const PERCENTILE = [/\.p95(Ms)?$/, /\.p75\[\d+\]$/, /phases\.p75\[\d+\]\.value$/];
const isPercentile = (path: string) => PERCENTILE.some((re) => re.test(path));

function close(a: number, b: number, rel: number): boolean {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true;
  const diff = Math.abs(a - b);
  return diff < 1e-9 || diff <= rel * Math.max(Math.abs(a), Math.abs(b));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Differences between two values, as "path: a != b". Numbers are equal within 1e-9 (sums in another order), percentiles within 2.5%. */
export function differences(a: unknown, b: unknown, path = "", out: string[] = []): string[] {
  if (out.length >= 12) return out;
  if (typeof a === "number" && typeof b === "number") {
    if (!close(a, b, isPercentile(path) ? 0.025 : 1e-9)) out.push(`${path}: ${a} != ${b}`);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} != ${b.length}`);
    else a.forEach((x, i) => differences(x, b[i], `${path}[${i}]`, out));
  } else if (isObject(a) && isObject(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[k], b[k], `${path}.${k}`, out);
  } else if (a !== b) {
    out.push(`${path}: ${JSON.stringify(a)?.slice(0, 120)} != ${JSON.stringify(b)?.slice(0, 120)}`);
  }
  return out;
}

/** Remove a dotted path (for example "selected.traffic") from a model copy. */
function drop(m: Record<string, unknown>, path: string): Record<string, unknown> {
  const parts = path.split(".");
  let at: unknown = m;
  for (const p of parts.slice(0, -1)) at = isObject(at) ? at[p] : undefined;
  if (isObject(at)) delete at[parts[parts.length - 1]!];
  return m;
}

/** Differences between the new and the legacy model of a page, after the documented normalizations; `skip` paths are left out. */
export function parityOf(page: LegacyPage, range: TimeRange, params: Record<string, string> = {}, skip: readonly string[] = []): string[] {
  const now = newModel(page, range, params) as { meta?: { settling?: unknown; sampled?: unknown } };
  const issues = now.meta && (now.meta.settling !== null || now.meta.sampled !== null) ? ["meta: settling and sampled must be null"] : [];
  const a = skip.reduce(drop, normalizeModel(page, now));
  const b = skip.reduce(drop, normalizeModel(page, legacyModel(page, range, params)));
  return [...issues, ...differences(a, b).map((d) => `${page} ${range} ${JSON.stringify(params)} ${d}`)];
}
