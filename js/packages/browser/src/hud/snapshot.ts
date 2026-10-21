import { currentRequest, endOf, ERROR_HOLD_MS, heldError, type RequestView, requestView } from "../hud-model.js";
import type { RecordedRequest } from "../recorder-types.js";
import { now } from "../session.js";
import type { HudSettings } from "./storage.js";

/** What the HUD shows right now, from the recorder's requests and the HUD settings. */
export interface HudSnapshot {
  req: RecordedRequest | null;
  view: RequestView;
  /** A request is still running. */
  busy: boolean;
  /** The failed request held on screen while live, or null. */
  held: RecordedRequest | null;
}

export function hudSnapshot(requests: readonly RecordedRequest[], s: HudSettings, pinnedId: string | null, slowMs: number, nowMs = now()): HudSnapshot {
  const req = currentRequest(requests, s.live, pinnedId, nowMs);
  return {
    req,
    view: requestView(req, slowMs),
    busy: requests.some((r) => r.durationMs === null && !r.error),
    held: s.live ? heldError(requests, nowMs) : null,
  };
}

/** Ms until a held failure stops being held, so the HUD moves on to the newest request. */
export const holdDelay = (held: RecordedRequest, nowMs = now()) => Math.max(0, endOf(held) + ERROR_HOLD_MS - nowMs) + 20;

/** Rows restored after a refresh have summary counts only. The one on screen loads its full stats. */
export const restoredIdOf = (req: RecordedRequest | null): string | null => (req?.restored && req.server?.insights == null ? req.traceId : null);

/** The request to pin when live turns off: the one on screen. */
export const pinOf = (snap: HudSnapshot): string | null => snap.req?.id ?? null;
