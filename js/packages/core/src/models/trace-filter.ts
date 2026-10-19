// The Traces page filter: service, status, duration, text, and order, for the list and the critical spans.
import type { TraceItem } from "../scale/facts-lists.js";
import type { ListFilter } from "../scale/needs.js";
import { rawService } from "../stats/errors.js";
import { type ModelParams, serviceParam } from "./input.js";
import { durationRange } from "./request-filter.js";

export type TraceSort = "time" | "duration";

export interface TraceFilter {
  /** A service's display name; "" for all. */
  service: string;
  /** "error", "ok", or "" for both. */
  status: "" | "error" | "ok";
  /** A duration class: fast, medium, slow, slowest; "" for all. */
  duration: string;
  q: string;
  sort: TraceSort;
}

/** The filter from URL parameters: service, status, duration, q, sort=duration. Unknown values filter nothing. */
export const traceFilterOf = (p: ModelParams): TraceFilter => ({
  service: serviceParam(p) ?? "",
  status: p.status === "error" || p.status === "ok" ? p.status : "",
  duration: p.duration && durationRange(p.duration) ? p.duration : "",
  q: p.q?.trim() ?? "",
  sort: p.sort === "duration" ? "duration" : "time",
});

/** The list filter for the traces table: services by the name spans carry. */
export const traceListFilter = (f: TraceFilter): ListFilter => ({
  ...(f.q ? { q: f.q } : {}),
  ...(f.service ? { service: rawService(f.service) } : {}),
  ...(f.status ? { status: f.status } : {}),
  ...(f.duration ? { duration: f.duration } : {}),
});

/** True when a trace row passes the service, status, and duration parts of a list filter (text is matched apart). */
export function traceMatches(t: TraceItem, f: ListFilter): boolean {
  if (f.service && !t.services.includes(f.service)) return false;
  if (f.status === "error" && t.status !== "error") return false;
  if (f.status === "ok" && t.status === "error") return false;
  const range = f.duration ? durationRange(f.duration) : null;
  return !range || (t.durationMs >= range[0] && t.durationMs < range[1]);
}
