// Router prefetches from browser SDKs older than the prefetch mark: a page that prefetches every link must not count as many failed calls.
import { ATTR_BROWSER_PREFETCH, ATTR_BROWSER_TYPE } from "./attributes.js";
import type { Span } from "./types.js";

/** A browser fetch of a Next.js router prefetch (`?_rsc=`), by its URL. */
function isRscFetch(s: Span): boolean {
  if (s.category !== "browser" || (s.attributes[ATTR_BROWSER_TYPE] ?? "fetch") !== "fetch") return false;
  const url = s.attributes["url.full"];
  if (typeof url !== "string" || !url.includes("_rsc=")) return false;
  try {
    return new URL(url).searchParams.has("_rsc");
  } catch {
    return false;
  }
}

/** The span marked as a prefetch, as newer SDKs send it: no error, no exception, so it stays out of the Web App row and its errors. */
export function markOldPrefetch(s: Span): Span {
  if (s.attributes[ATTR_BROWSER_PREFETCH] === true || !isRscFetch(s)) return s;
  const failed = s.status === "error";
  return {
    ...s,
    status: failed ? "unset" : s.status,
    statusMessage: failed ? null : s.statusMessage,
    events: s.events.filter((e) => e.name !== "exception"),
    attributes: { ...s.attributes, [ATTR_BROWSER_PREFETCH]: true },
  };
}
