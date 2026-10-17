/** How an add-on keeps traces. Shown on the dashboard so counts are read right. */
export interface SamplingInfo {
  /** Share of traces kept, 0 to 1. */
  rate: number;
  /** Traces with an error are kept at any rate. */
  keepErrors: boolean;
  /** Traces with a server-side span this slow (ms) are kept at any rate. Browser spans never count. Null: no slow rule. */
  keepSlowMs: number | null;
}

const SPAN = 0x1_0000_0000;

/** True when the trace falls inside the rate. Reads the last 8 hex digits, so every add-on (Node, .NET) keeps the same traces. */
export function keepByRate(traceId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (!(rate > 0)) return false;
  const n = Number.parseInt(traceId.slice(-8), 16);
  return Number.isFinite(n) && n / SPAN < rate;
}
