import { type Health, healthOf, timingSegments } from "@wizeworks/lens-core";
import { endOf, type RequestView, requestView } from "../hud-model.js";
import type { RecordedRequest, ServerStats } from "../recorder-types.js";
import { callKey, type HudPage } from "./page-log.js";

/** What the HUD shows: one page, with the page's request and all its calls added up. */
export interface HudSnapshot {
  /** The page as one row: its path, its load time, and the server stats of the page and its calls added up. */
  req: RecordedRequest;
  view: RequestView;
  /** The request that loaded the page, then its calls, oldest first. */
  calls: RecordedRequest[];
  /** The page's load request, or null for a route change. */
  lead: RecordedRequest | null;
  /** A call is still running. */
  busy: boolean;
  /** Calls dropped to keep memory small. */
  dropped: number;
}

/** A route change's load: calls that start this soon after it, except recurring ones. Later calls do not move its Total. */
export const ROUTE_LOAD_MS = 2000;

// Pending server stats (info) count as worse than success, so the page is not green while they load.
const RANK: Record<Health, number> = { neutral: 0, success: 1, info: 2, opportunity: 3, warning: 4, critical: 5 };

const finished = (r: RecordedRequest) => r.durationMs !== null || !!r.error;

/** Sum of the known values. Null when none is known. */
function sum(values: readonly (number | null | undefined)[]): number | null {
  let total: number | null = null;
  for (const v of values) if (v !== null && v !== undefined) total = (total ?? 0) + v;
  return total;
}

function addParts(list: ServerStats[]): ServerStats["parts"] {
  const parts = list.flatMap((s) => (s.parts ? [s.parts] : []));
  if (parts.length === 0) return null;
  return { codeMs: sum(parts.map((p) => p.codeMs))!, dbMs: sum(parts.map((p) => p.dbMs))!, httpOutMs: sum(parts.map((p) => p.httpOutMs))!, httpOutCount: sum(parts.map((p) => p.httpOutCount))! };
}

/** The server stats of `rows` added up. Undefined when none has stats yet. */
export function addUp(rows: readonly RecordedRequest[]): ServerStats | undefined {
  const list = rows.flatMap((r) => (r.server ? [r.server] : []));
  if (list.length === 0) return undefined;
  const slowest = list.flatMap((s) => (s.dbSlowestMs === null ? [] : [s.dbSlowestMs]));
  return {
    name: list[0]!.name,
    durationMs: sum(list.map((s) => s.durationMs)),
    dbCount: sum(list.map((s) => s.dbCount)) ?? 0,
    dbMs: sum(list.map((s) => s.dbMs)),
    dbTotalMs: sum(list.map((s) => s.dbTotalMs)),
    dbSlowestMs: slowest.length > 0 ? Math.max(...slowest) : null,
    dbDurations: list.flatMap((s) => s.dbDurations).slice(-200),
    httpClientCount: sum(list.map((s) => s.httpClientCount)) ?? 0,
    errorCount: sum(list.map((s) => s.errorCount)) ?? 0,
    insights: sum(list.map((s) => s.insights)),
    parts: addParts(list),
    services: [...new Set(list.flatMap((s) => s.services))],
  };
}

// The page's Total: its load to the first paint, or a route change to the end of the calls that loaded it.
function pageTotal(page: HudPage, lead: RecordedRequest | null, calls: readonly RecordedRequest[]): number | null {
  if (page.navigation === "load") return lead?.durationMs == null ? null : lead.durationMs + (lead.renderMs ?? 0);
  const loads = (c: RecordedRequest) => finished(c) && c.startMs <= page.startMs + ROUTE_LOAD_MS && !page.recurring.has(callKey(c));
  const ends = calls.filter(loads).map((c) => endOf(c) + (c.renderMs ?? 0) - page.startMs);
  const all = page.renderMs === null ? ends : [page.renderMs, ...ends];
  return all.length > 0 ? Math.max(...all) : null;
}

// Bar parts. Time added up over many calls can be more than the page took: then the bar shows the shares.
function segmentsOf(totalMs: number | null, serverMs: number | null, dbMs: number | null, renderMs: number | null): RequestView["segments"] {
  if (totalMs === null) return null;
  const server = Math.max(serverMs ?? 0, dbMs ?? 0);
  const busy = server + (renderMs ?? 0);
  if (busy <= totalMs) return timingSegments({ totalMs, serverMs, dbMs: dbMs ?? 0, renderMs });
  const k = totalMs / busy;
  return { server: (server - (dbMs ?? 0)) * k, db: (dbMs ?? 0) * k, render: (renderMs ?? 0) * k, other: 0 };
}

const worst = (list: Health[]): Health => list.reduce<Health>((a, b) => (RANK[b] > RANK[a] ? b : a), "neutral");

function pageView(rows: RecordedRequest[], srv: ServerStats | undefined, totalMs: number | null, renderMs: number | null, callCount: number, slowMs: number): RequestView {
  const views = rows.map((r) => requestView(r, slowMs));
  const pending = rows.some((r) => r.profiled && !r.server);
  const known = (v: number | null | undefined) => (v ?? null) === null && pending ? null : (v ?? 0);
  const insights = known(srv?.insights);
  const errors = views.reduce((n, v) => n + v.errors, 0);
  return {
    health: rows.length === 0 ? "neutral" : worst(views.map((v) => v.health)),
    totalMs,
    serverMs: srv?.durationMs ?? null,
    dbMs: srv?.dbMs ?? null,
    renderMs,
    segments: segmentsOf(totalMs, srv?.durationMs ?? null, srv?.dbMs ?? null, renderMs),
    sql: known(srv?.dbCount),
    fetch: callCount,
    insights,
    errors,
  };
}

// The recorder makes the page's row before the first paint. Read the paint from the browser once it has one.
function loadRequest(doc: RecordedRequest | null, loadRow: () => RecordedRequest | null): RecordedRequest | null {
  if (doc && doc.renderMs !== null) return doc;
  const fresh = loadRow();
  return doc ? { ...doc, renderMs: fresh?.renderMs ?? null } : fresh;
}

/** The page, its request and calls added up, up to `untilMs` when paused. `loadRow` reads the page load from the browser when no WizeLens server rendered it. */
export function summarizePage(page: HudPage, loadRow: () => RecordedRequest | null, slowMs: number, untilMs = Infinity): HudSnapshot {
  const lead = page.navigation === "load" ? loadRequest(page.doc, loadRow) : null;
  // Paused: only the calls that started before the pause.
  const calls = [...page.calls.values()].filter((c) => c.startMs <= untilMs).sort((a, b) => a.startMs - b.startMs);
  const rows = lead ? [lead, ...calls] : calls;
  const srv = addUp(rows);
  const totalMs = pageTotal(page, lead, calls);
  const renderMs = lead ? lead.renderMs : page.renderMs;
  const statuses = rows.flatMap((r) => (r.status === null ? [] : [r.status]));
  // The page's own status; a failed call (4xx, 5xx) shows instead, and a 201 from a POST never does.
  const failed = statuses.filter((s) => s >= 400);
  const req: RecordedRequest = {
    id: `page-${page.id}`,
    method: "GET",
    url: page.url,
    path: page.path,
    status: failed.length > 0 ? Math.max(...failed) : (lead?.status ?? (statuses.length > 0 || totalMs !== null ? 200 : null)),
    durationMs: totalMs,
    renderMs,
    traceId: lead?.traceId ?? "",
    profiled: lead?.profiled ?? false,
    startMs: page.startMs,
    error: null,
    server: srv,
  };
  const view = pageView(rows, srv, totalMs, renderMs, calls.length + page.dropped, slowMs);
  const health = totalMs === null ? view.health : worst([view.health, healthOf({ status: 200, error: false, totalMs, insights: 0 }, slowMs)]);
  return { req, view: { ...view, health }, calls: rows, lead, busy: calls.some((c) => !finished(c)), dropped: page.dropped };
}
