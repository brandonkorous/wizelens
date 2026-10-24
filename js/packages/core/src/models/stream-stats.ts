// The Streams figure of the Service and Endpoint pages: how many streams opened, and how long they stayed open.
import { type Agg, avgOfAgg } from "../scale/agg.js";
import { histPercentile } from "../scale/hist.js";
import type { RollupKind } from "../scale/kinds.js";
import type { NeedResults } from "../scale/needs.js";
import { groupNeed, totalOf } from "./read.js";

/** Streams (server-sent events, MCP, WebSocket upgrades) in the range. Their open time is not in latency. */
export interface StreamStats {
  count: number;
  avgOpenMs: number | null;
  p95OpenMs: number | null;
}

/** The need for one row's streams: `svc.stream` by Services row key, `req.stream` by row key and endpoint. */
export const streamNeed = (id: string, kind: Extract<RollupKind, "svc.stream" | "req.stream">, key: string) => groupNeed(id, kind, "cur", { hist: true, filter: { keys: [key] } });

const statsOf = (a: Agg): StreamStats | null => (a.n ? { count: a.n, avgOpenMs: avgOfAgg(a), p95OpenMs: a.hist ? histPercentile(a.hist, a.n, 95) : null } : null);

/** The streams a need read, or null when none opened. */
export const streamsOf = (d: NeedResults, id: string): StreamStats | null => statsOf(totalOf(d, id));
