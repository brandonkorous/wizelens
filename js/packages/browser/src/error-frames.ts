import { annotateErrorFrames, cachedLoader, fetchMapLoader, type MapLoader, type Span } from "@wizeworks/lens-core";
import type { Sender } from "./sender.js";

/** Longest wait for a map before the error is sent without its frame. */
const FRAME_WAIT_MS = 3000;

/** Maps of this page's own scripts: in dev the server serves them, so errors group by source with no upload. */
export function pageMapLoader(): MapLoader {
  const allow = (u: URL) => typeof location !== "undefined" && u.origin === location.origin;
  return cachedLoader(fetchMapLoader({ allow, maxBytes: 16 * 1024 * 1024, timeoutMs: FRAME_WAIT_MS }), { max: 10, hitMs: 30_000 });
}

/** Send an error span; with a loader, hold it until its group frame is added. A page hide sends it as it is. */
export function sendError(sender: Pick<Sender, "push" | "hold" | "release">, span: Span, load: MapLoader | null): void {
  if (!load) return sender.push(span);
  sender.hold(span.spanId, span);
  void annotateErrorFrames([span], load, FRAME_WAIT_MS).finally(() => sender.release(span.spanId));
}

/** The release the build plugins set (`globalThis.__WIZELENS_RELEASE__`), or null. */
export function injectedRelease(): string | null {
  const v = (globalThis as { __WIZELENS_RELEASE__?: unknown }).__WIZELENS_RELEASE__;
  return typeof v === "string" && v ? v : null;
}
