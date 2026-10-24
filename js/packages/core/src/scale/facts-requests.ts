// Request facts: the req* kinds (totals, filter dimensions, per service, time parts) and the ins* kinds.
import { insightHits } from "../stats/insights.js";
import { isFailed, type RequestRow } from "../stats/requests.js";
import { shownServices } from "../web-app.js";
import { type Contribution, contribution, withServices } from "./agg.js";
import { joinKey } from "./kinds.js";

export type StatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "none";
export type DurationClass = "fast" | "medium" | "slow" | "slowest" | "none";

/** Status filter class of a request: "2xx" and so on, or "none" without a usable status. */
export function statusClassOf(status: number | null): StatusClass {
  const code = status ?? 0;
  return code >= 100 && code < 600 ? (`${Math.floor(code / 100)}xx` as StatusClass) : "none";
}

/** Duration filter class, with the same bounds as the Requests page filter. */
export function durationClassOf(ms: number): DurationClass {
  if (!(ms >= 0)) return "none";
  return ms < 100 ? "fast" : ms < 500 ? "medium" : ms < 1000 ? "slow" : "slowest";
}

/** Key parts after the service: method, status class, failed ("0" or "1"), duration class. */
export const requestDims = (r: RequestRow): string[] => [r.method, statusClassOf(r.status), isFailed(r) ? "1" : "0", durationClassOf(r.durationMs)];

/** The parts of a request's time, as the Overview timing chart shows them. Null parts were not measured. */
export const REQUEST_PARTS: readonly { key: string; pick: (r: RequestRow) => number | null }[] = [
  { key: "request", pick: (r) => r.durationMs },
  { key: "server", pick: (r) => r.serverMs },
  { key: "database", pick: (r) => (r.serverMs === null ? null : r.dbMs) },
  { key: "render", pick: (r) => r.renderMs },
  { key: "network", pick: (r) => r.networkMs },
];

/** Insight group key, the same as `requestInsightGroups` uses. */
export const insightKeyOf = (kind: string, shape: string): string => `${kind}|${shape}`;

function insightContributions(r: RequestRow): Contribution[] {
  return insightHits(r).flatMap((h) => {
    const key = insightKeyOf(h.kind, h.shape);
    const data = { kind: h.kind, shape: h.shape, endpoint: h.endpoint, traceId: h.traceId, startMs: h.startMs };
    return [
      contribution("ins", key, r.startMs, { sum: h.totalMs, c: [h.count], top: { rank: r.startMs, data } }),
      contribution("ins.ep", joinKey(key, h.endpoint), r.startMs),
      ...(r.user ? [contribution("ins.u", joinKey(key, r.user), r.startMs)] : []),
    ];
  });
}

function partContributions(r: RequestRow): Contribution[] {
  return REQUEST_PARTS.flatMap((p) => {
    const v = p.pick(r);
    return v === null ? [] : [contribution("req.part", p.key, r.startMs, { sum: v, values: [v] })];
  });
}

/** A signed-in user's request: their totals and name (`usr`), and the endpoint they used (`ep.u`, `service|endpoint|user`). */
function userContributions(r: RequestRow, base: Pick<Contribution, "err" | "sum">, name: string | null): Contribution[] {
  if (!r.user) return [];
  const top = name ? { top: { rank: r.startMs, data: { name } } } : {};
  return [contribution("usr", r.user, r.startMs, { ...base, values: [r.durationMs], ...top }), contribution("ep.u", joinKey(shownServices([r.service], r.app)[0]!, r.endpoint, r.user), r.startMs)];
}

/** Everything one request adds to the rollups; `userName` is the user's display name, kept on their `usr` row. */
export function requestContributions(r: RequestRow, userName: string | null = null): Contribution[] {
  const at = r.startMs;
  const dims = requestDims(r);
  const base = { err: isFailed(r) ? 1 : 0, sum: r.durationMs };
  const withInsights = r.insights > 0 ? 1 : 0;
  const out = [
    contribution("req", "", at, { ...base, c: [r.dbCount, withInsights, r.insights], values: [r.durationMs] }),
    contribution("req.dim", joinKey(...dims), at, { ...base, c: [r.dbCount, withInsights, r.insights] }),
  ];
  for (const s of new Set([r.service, ...r.services])) {
    out.push(contribution("req.svc", joinKey(s, ...dims), at, { ...base, c: [r.dbCount, withInsights, s === r.service ? 1 : 0] }));
  }
  const services = shownServices([r.service, ...r.services], r.app);
  return [...out, ...partContributions(r), ...insightContributions(r), ...userContributions(r, base, userName)].flatMap((c) => withServices(c, services));
}
