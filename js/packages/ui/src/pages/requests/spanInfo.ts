import { entryServerSpan, ATTR_REQUEST_BODY, ATTR_REQUEST_BODY_TRUNCATED, ATTR_RESPONSE_BODY, ATTR_RESPONSE_BODY_TRUNCATED, REQUEST_HEADER_PREFIX, RESPONSE_HEADER_PREFIX, type Span, type Trace } from "@wizeworks/lens-core/internal";

/** The entry server span of a trace: the request the app received. */
export function rootServer(trace: Trace | undefined): Span | undefined {
  return trace ? entryServerSpan(trace.spans) : undefined;
}

/** Captured headers with one prefix, as [name, value] pairs sorted by name. */
export function headersOf(span: Span | undefined, prefix: string): [string, string][] {
  if (!span) return [];
  return Object.entries(span.attributes)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]): [string, string] => [k.slice(prefix.length), v === null ? "" : String(v)])
    .sort(([a], [b]) => a.localeCompare(b));
}

export const requestHeaders = (span: Span | undefined) => headersOf(span, REQUEST_HEADER_PREFIX);
export const responseHeaders = (span: Span | undefined) => headersOf(span, RESPONSE_HEADER_PREFIX);

export function numberAttr(span: Span | undefined, key: string): number | null {
  const v = span?.attributes[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export interface BodyPreview {
  text: string;
  truncated: boolean;
}

const BODY_KEYS = {
  request: [ATTR_REQUEST_BODY, ATTR_REQUEST_BODY_TRUNCATED],
  response: [ATTR_RESPONSE_BODY, ATTR_RESPONSE_BODY_TRUNCATED],
} as const;

/** The captured request or response body, pretty-printed when it is complete JSON. */
export function bodyOf(span: Span | undefined, which: keyof typeof BODY_KEYS = "response"): BodyPreview | null {
  const [key, cut] = BODY_KEYS[which];
  const raw = span?.attributes[key];
  if (typeof raw !== "string") return null;
  const truncated = span?.attributes[cut] === true;
  if (truncated) return { text: raw, truncated };
  try {
    return { text: JSON.stringify(JSON.parse(raw), null, 2), truncated };
  } catch {
    return { text: raw, truncated };
  }
}

const REASONS: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Content", 429: "Too Many Requests",
  500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};

/** "200 OK", "404 Not Found", or just the number. */
export const statusText = (status: number | null, aborted = false): string => (aborted ? "Aborted by the client" : status === null ? "No status" : REASONS[status] ? `${status} ${REASONS[status]}` : String(status));
