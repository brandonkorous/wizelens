// The request a trace answers, as the security rules read it: its headers, HTTPS, and its input values.
import { pathShape } from "../analysis.js";
import { ATTR_ENDUSER, ATTR_REQUEST_BODY, ATTR_RESPONSE_BODY } from "../attributes.js";
import { entryServerSpan } from "../trace.js";
import type { Span, Trace } from "../types.js";

export interface SecurityRequest {
  span: Span;
  method: string;
  /** `url.path`, without the query. */
  path: string;
  /** `METHOD route`, else `METHOD path shape`, as the Requests page names it. */
  endpoint: string;
  status: number | null;
  https: boolean;
  /** True when any response header was captured. */
  headersKnown: boolean;
  /** Response header value by lower-case name. */
  header(name: string): string | null;
  /** Request header value by lower-case name. */
  requestHeader(name: string): string | null;
  /** True when a span of the trace names the signed-in user. */
  user: boolean;
  body: string | null;
  inputs: string[];
}

export const str = (s: Span, key: string): string | null => {
  const v = s.attributes[key];
  return v === null || v === undefined ? null : String(v);
};

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
};

/** A value counts as input when it is 3 to 200 characters, or 2 or more digits, and not a redaction marker. */
export const isInputValue = (v: string): boolean => !v.startsWith("[redacted") && (/^\d{2,}$/.test(v) || (v.length >= 3 && v.length <= 200));

/** Query values, decoded. */
export function queryValues(query: string | null): string[] {
  if (!query) return [];
  return query.split("&").flatMap((pair) => {
    const eq = pair.indexOf("=");
    return eq < 0 ? [] : [decode(pair.slice(eq + 1))];
  });
}

/** Values of the `{name}` and `:name` segments of a route, from the same segments of the path. */
export function pathValues(route: string | null, path: string): string[] {
  if (!route) return [];
  const r = route.split("/");
  const p = path.split("/");
  return r.flatMap((seg, i) => (/^(\{[^}]+\}|:\w+)$/.test(seg) && p[i] ? [decode(p[i]!)] : []));
}

/** String and number leaves of a JSON body, depth 5, at most 100. */
export function bodyValues(body: string | null): string[] {
  if (!body) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const out: string[] = [];
  const walk = (v: unknown, depth: number): void => {
    if (out.length >= 100 || depth > 5 || v === null) return;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (typeof v === "object") for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
  };
  walk(parsed, 0);
  return out.slice(0, 100);
}

function inputsOf(span: Span, path: string): string[] {
  const body = span.attributes[`${ATTR_REQUEST_BODY}.truncated`] === true ? null : str(span, ATTR_REQUEST_BODY);
  const all = [...queryValues(str(span, "url.query")), ...pathValues(str(span, "http.route"), path), ...bodyValues(body)];
  return [...new Set(all.filter(isInputValue))];
}

const statusOf = (s: Span): number | null => {
  const n = Number(s.attributes["http.response.status_code"]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const firstValue = (v: string | null): string | null => (v === null ? null : v.split(",")[0]!.trim().toLowerCase());

/** The request a trace answers, or null when the trace has no server span. */
export function securityRequest(trace: Trace): SecurityRequest | null {
  const span = entryServerSpan(trace.spans);
  if (!span) return null;
  const method = (str(span, "http.request.method") ?? "GET").toUpperCase();
  const path = str(span, "url.path") ?? "/";
  const query = str(span, "url.query");
  const header = (name: string) => str(span, `http.response.header.${name}`);
  const requestHeader = (name: string) => str(span, `http.request.header.${name}`);
  return {
    span,
    method,
    path,
    endpoint: `${method} ${str(span, "http.route") ?? pathShape(query ? `${path}?${query}` : path)}`,
    status: statusOf(span),
    https: str(span, "url.scheme")?.toLowerCase() === "https" || firstValue(requestHeader("x-forwarded-proto")) === "https",
    headersKnown: Object.keys(span.attributes).some((k) => k.startsWith("http.response.header.")),
    header,
    requestHeader,
    user: trace.spans.some((s) => !!str(s, ATTR_ENDUSER)),
    body: str(span, ATTR_RESPONSE_BODY),
    inputs: inputsOf(span, path),
  };
}
