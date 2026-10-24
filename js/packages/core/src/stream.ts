// Streams (server-sent events, MCP streams, WebSocket upgrades): open for minutes on purpose, so only their first byte is request time.
import { ATTR_STREAM, ATTR_STREAM_FIRST_BYTE_MS, RESPONSE_HEADER_PREFIX } from "./attributes.js";
import type { Span } from "./types.js";

/** A response content type that streams events. */
export function isStreamContentType(v: unknown): boolean {
  const first = Array.isArray(v) ? v[0] : v;
  return typeof first === "string" && first.trim().toLowerCase().startsWith("text/event-stream");
}

/** A server span that answered with a stream: marked by the add-on, `text/event-stream`, or a 101 upgrade. */
export function isStreamSpan(s: Span): boolean {
  if (s.category !== "http.server") return false;
  const mark = s.attributes[ATTR_STREAM];
  if (mark === true || mark === "true") return true;
  if (Number(s.attributes["http.response.status_code"]) === 101) return true;
  return isStreamContentType(s.attributes[`${RESPONSE_HEADER_PREFIX}content-type`]);
}

/** A stream's time to its first byte, the part that is request time; 0 when the add-on did not measure it. */
export function streamFirstByteMs(s: Span): number {
  const v = Number(s.attributes[ATTR_STREAM_FIRST_BYTE_MS]);
  return s.attributes[ATTR_STREAM_FIRST_BYTE_MS] != null && Number.isFinite(v) && v >= 0 ? Math.min(v, s.durationMs) : 0;
}

/** The time a span counts as request time: the first byte for a stream, else its whole duration. */
export const requestMsOf = (s: Span): number => (isStreamSpan(s) ? streamFirstByteMs(s) : s.durationMs);
