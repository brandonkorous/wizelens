const HEX = "0123456789abcdef";

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

const ZERO_TRACE = "0".repeat(32);
const ZERO_SPAN = "0".repeat(16);

/** New 32-hex W3C trace id (never all zeros). */
export function newTraceId(): string {
  let id = randomHex(16);
  while (id === ZERO_TRACE) id = randomHex(16);
  return id;
}

/** New 16-hex W3C span id (never all zeros). */
export function newSpanId(): string {
  let id = randomHex(8);
  while (id === ZERO_SPAN) id = randomHex(8);
  return id;
}

export interface TraceParent {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/** Parse a W3C `traceparent` header. Returns null when invalid. */
export function parseTraceparent(value: string | null | undefined): TraceParent | null {
  if (!value) return null;
  const m = TRACEPARENT_RE.exec(value.trim().toLowerCase());
  if (!m) return null;
  const version = m[1]!;
  const traceId = m[2]!;
  const spanId = m[3]!;
  const flags = m[4]!;
  if (version === "ff" || traceId === ZERO_TRACE || spanId === ZERO_SPAN) return null;
  return { traceId, spanId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

/** Format a W3C `traceparent` header (version 00). */
export function formatTraceparent(traceId: string, spanId: string, sampled = true): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}
