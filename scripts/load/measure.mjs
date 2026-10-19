// Timings for the load test: percentiles, and the searches and pages it times against the plan's targets.

/** The value at fraction `p` of sorted `ms`. */
export const percentile = (ms, p) => [...ms].sort((a, b) => a - b)[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? 0;

/** Searches over 30 days: words (indexed contains), fields, attributes, and an empty search. */
export const SEARCHES = [
  ["requests", ""],
  ["requests", "service:checkout status:5xx"],
  ["requests", '"connection reset"'],
  ["requests", "@enduser.id:u-1234"],
  ["requests", "duration:>2s path:/api/orders/*"],
  ["spans", "category:db duration:>=500ms"],
  ["spans", "q17"],
  ["logs", 'level:error "deadlock"'],
  ["traces", "error:true"],
];

/** Dashboard pages over 24 hours and 7 days. */
export const PAGES = ["overview?range=24h", "requests?range=24h", "errors?range=7d", "logs?range=24h", "database?range=24h", "overview?range=7d"];

/** Time `run` `repeat` times, after one warm-up call. Returns each call's milliseconds. */
export async function time(run, repeat) {
  await run();
  const ms = [];
  for (let i = 0; i < repeat; i++) {
    const t0 = performance.now();
    await run();
    ms.push(performance.now() - t0);
  }
  return ms;
}

/** One report line: p50, p95, max, and whether p95 meets `targetMs`. */
export function line(name, ms, targetMs) {
  const p95 = percentile(ms, 0.95);
  const mark = p95 <= targetMs ? "ok  " : "SLOW";
  return `${mark} ${name.padEnd(48)} p50 ${percentile(ms, 0.5).toFixed(0).padStart(6)} ms  p95 ${p95.toFixed(0).padStart(6)} ms  max ${Math.max(...ms).toFixed(0).padStart(6)} ms`;
}
