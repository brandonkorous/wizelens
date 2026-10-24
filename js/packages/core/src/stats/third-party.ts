// Browser errors thrown by other sites' code on the page (an embedded sign-in, an ad), not by the app.
import type { Span } from "../types.js";

const FRAME_ORIGIN = /\bhttps?:\/\/[^\s/)'"]+/g;

/** True when a browser error's stack names script URLs and every one is on another origin than the page (`url.full`). */
export function isThirdPartyError(span: Span, stack: string | null): boolean {
  const page = span.attributes["url.full"];
  if (!stack || typeof page !== "string") return false;
  let origin: string;
  try {
    origin = new URL(page).origin;
  } catch {
    return false;
  }
  const frames = [...stack.matchAll(FRAME_ORIGIN)].map((m) => m[0]);
  return frames.length > 0 && frames.every((f) => f !== origin);
}
