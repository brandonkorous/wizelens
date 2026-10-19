// A rich, deterministic set of traces over many windows, for facts, executor, and parity tests. Test-only.
import { VERSION_ATTR } from "../releases.js";
import type { Trace } from "../types.js";
import { cartDup, checkoutFlow, grpcCall, ordersN1, payFail, reportSlow } from "./scenario-api.js";
import { traceIdOf } from "./scenario-kit.js";
import { fetchOnly, job, pageCheckout, pageHome } from "./scenario-web.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "Now" for the scenario, on the hour, so every range lines up with whole rollup buckets. */
export const SCENARIO_NOW = Date.UTC(2026, 0, 15, 12);

/** How long before now each group of traces starts. Each group is at least a minute from every window edge. */
export const SCENARIO_ANCHORS: readonly number[] = [
  2 * MIN, 7 * MIN, 12 * MIN, 18 * MIN, 24 * MIN, 35 * MIN, 50 * MIN, 70 * MIN, 100 * MIN,
  3 * HOUR, 7 * HOUR, 13 * HOUR, 20 * HOUR, 26 * HOUR, 36 * HOUR, 45 * HOUR,
  3 * DAY, 5 * DAY, 9 * DAY, 12 * DAY, 20 * DAY,
];

/** Every kind of trace, one of each per anchor, 9 s apart. */
export const SCENARIO_BUILDERS = [ordersN1, cartDup, reportSlow, payFail, checkoutFlow, pageCheckout, pageHome, fetchOnly, job, grpcCall] as const;

/** The version server-side services ran at an anchor: 1.0.0 before a day ago, 1.2.0 in the last 20 minutes, 1.1.0 between. */
export const scenarioVersion = (anchor: number): string => (SCENARIO_ANCHORS[anchor]! > DAY ? "1.0.0" : SCENARIO_ANCHORS[anchor]! < 20 * MIN ? "1.2.0" : "1.1.0");

function withVersion(t: Trace, anchor: number): Trace {
  for (const s of t.spans) if (s.service !== "browser") s.attributes[VERSION_ATTR] = scenarioVersion(anchor);
  return t;
}

/** Build the scenario's traces, newest first. */
export function buildScenario(now = SCENARIO_NOW): Trace[] {
  const traces = SCENARIO_ANCHORS.flatMap((ago, a) => SCENARIO_BUILDERS.map((build, t) => withVersion(build(traceIdOf(a, t), now - ago - 3_000 - t * 9_000, a), a)));
  return traces.sort((a, b) => b.startMs - a.startMs);
}

let cached: Trace[] | null = null;

/** The scenario traces, built once per test file. */
export const scenarioTraces = (): Trace[] => (cached ??= buildScenario());
