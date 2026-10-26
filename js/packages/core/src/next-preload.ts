// Next.js 16 preloads every route at start and ignores the ones it cannot load ("Intentionally ignored because this is a preload step"): not an error.
import type { Span } from "./types.js";

/** The placeholder module Next.js names for an edge route with no Node entry point. */
const EDGE_PLACEHOLDER = ".next/server/app-edge-has-no-entrypoint";

const isPreloadMiss = (e: Span["events"][number]): boolean =>
  e.name === "exception" && e.attributes["exception.type"] === "MODULE_NOT_FOUND" && String(e.attributes["exception.message"] ?? "").includes(EDGE_PLACEHOLDER);

/** True for the `load route module` span of that preload: outside any request, and only the placeholder module was missing. */
function isIgnoredPreload(s: Span): boolean {
  if (s.parentSpanId !== null) return false;
  if (s.name !== "load route module" && s.attributes["next.span_type"] !== "LoadComponents.loadRouteModule") return false;
  return s.events.some(isPreloadMiss);
}

/** The span without the preload's MODULE_NOT_FOUND: its exception and the error status it caused are dropped. */
export function dropIgnoredPreload(s: Span): Span {
  if (!isIgnoredPreload(s)) return s;
  const events = s.events.filter((e) => !isPreloadMiss(e));
  const stillFailed = events.some((e) => e.name === "exception");
  return { ...s, events, status: stillFailed ? s.status : "unset", statusMessage: stillFailed ? s.statusMessage : null };
}
