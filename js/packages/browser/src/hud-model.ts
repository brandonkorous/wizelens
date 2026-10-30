import { DEFAULT_SLOW_MS, type Health, healthOf, timingSegments } from "@wizeworks/lens-core/internal";
import type { RecordedRequest } from "./recorder-types.js";
import { now } from "./session.js";

/** What the HUD shows for one request. Null fields are not known (yet). */
export interface RequestView {
  health: Health;
  /** Request start to the next paint. Falls back to the round trip until the paint is measured. */
  totalMs: number | null;
  serverMs: number | null;
  dbMs: number | null;
  renderMs: number | null;
  /** Stacked bar parts in ms. They add up to `totalMs`. */
  segments: { server: number; db: number; render: number; other: number } | null;
  sql: number | null;
  fetch: number | null;
  insights: number | null;
  errors: number;
}

export const NEUTRAL_VIEW: RequestView = {
  health: "neutral",
  totalMs: null,
  serverMs: null,
  dbMs: null,
  renderMs: null,
  segments: null,
  sql: null,
  fetch: null,
  insights: null,
  errors: 0,
};

export function requestView(r: RecordedRequest | null, slowMs = DEFAULT_SLOW_MS): RequestView {
  if (!r) return NEUTRAL_VIEW;
  const srv = r.server;
  const totalMs = r.durationMs === null ? null : r.durationMs + (r.renderMs ?? 0);
  const errors = (srv?.errorCount ?? 0) + (r.error ? 1 : 0);
  // A request the server did not profile has no insights to find.
  const insights = srv ? srv.insights : r.profiled ? null : 0;
  const serverMs = srv?.durationMs ?? null;
  const dbMs = srv?.dbMs ?? null;
  return {
    health: healthOf({ status: r.status, error: errors > 0, totalMs, insights }, slowMs),
    totalMs,
    serverMs,
    dbMs,
    renderMs: r.renderMs,
    segments: totalMs === null ? null : timingSegments({ totalMs, serverMs, dbMs: dbMs ?? 0, renderMs: r.renderMs }),
    sql: srv ? srv.dbCount : r.profiled ? null : 0,
    fetch: srv ? srv.httpClientCount : r.profiled ? null : 0,
    insights,
    errors,
  };
}

/** A failed request stays on screen this long, so newer background requests do not hide it. */
export const ERROR_HOLD_MS = 8000;

const failed = (r: RecordedRequest) => !!r.error || (r.status ?? 0) >= 400;
export const endOf = (r: RecordedRequest): number => r.startMs + (r.durationMs ?? 0);

/** The newest live request that failed less than ERROR_HOLD_MS ago, if any. */
export function heldError(requests: readonly RecordedRequest[], nowMs: number): RecordedRequest | null {
  return requests.find((r) => failed(r) && !r.restored && nowMs - endOf(r) < ERROR_HOLD_MS) ?? null;
}

/** The request the HUD shows. Live: a fresh failure, else the newest finished (else newest) request. Paused: the pinned one. */
export function currentRequest(
  requests: readonly RecordedRequest[],
  live: boolean,
  pinnedId: string | null,
  nowMs = now(),
): RecordedRequest | null {
  if (!live && pinnedId) {
    const pinned = requests.find((r) => r.id === pinnedId);
    if (pinned) return pinned;
  }
  return heldError(requests, nowMs) ?? requests.find((r) => r.durationMs !== null) ?? requests[0] ?? null;
}

/** "284 ms", "1,842 ms", "12.4 s", "4.2 ms". A dash when unknown. */
export function fmtMs(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "0 ms";
  if (v < 10) return `${v.toFixed(1)} ms`;
  if (v < 10_000) return `${Math.round(v).toLocaleString("en-US")} ms`;
  return `${(v / 1000).toFixed(1)} s`;
}

/** Whole percent of `part` in `total`. Empty when unknown. */
export function pct(part: number | null | undefined, total: number | null | undefined): string {
  if (part === null || part === undefined || !total) return "";
  return `${Math.round((part / total) * 100)}%`;
}

/** Like `pct`, but empty when the part is more than the total (time added up over many calls). */
export const share = (part: number | null | undefined, total: number | null | undefined): string =>
  part !== null && part !== undefined && total && part <= total ? pct(part, total) : "";

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
