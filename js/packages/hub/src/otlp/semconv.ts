import { type AttributeValue, type Attributes, SEMCONV_ALIASES } from "@wizeworks/lens-core/internal";

/** Copy older names to the current ones when the current one is missing. First alias wins. */
export function applyAliases(out: Attributes): Attributes {
  for (const [old, current] of Object.entries(SEMCONV_ALIASES)) {
    if (out[old] !== undefined && out[current] === undefined) out[current] = out[old]!;
  }
  return out;
}

const HEADER_RE = /^(http\.(?:request|response)\.header\.)(.+)$/;

/** True for a captured header attribute (`http.request.header.*`, `http.response.header.*`). */
export const isHeaderKey = (key: string): boolean => HEADER_RE.test(key);

/** Header names as the add-ons send them: lower case with dashes (Python sends `content_type`). */
export function headerKey(key: string): string {
  const m = HEADER_RE.exec(key)!;
  return m[1] + m[2]!.toLowerCase().replace(/_/g, "-");
}

/** The agents send each header as a list of values; the dashboard shows them joined with ", ". */
export function headerValue<V extends { arrayValue?: { values?: V[] } }>(v: V | undefined, one: (x: V | undefined) => AttributeValue): AttributeValue {
  if (!v?.arrayValue) return one(v);
  return (v.arrayValue.values ?? []).map((x) => String(one(x) ?? "")).join(", ");
}

/** Django's server spans: the path only in `http.url`, and a route with no leading slash (the .NET add-on adds one too). */
function serverPath(a: Attributes): void {
  const full = a["url.full"];
  if (a["url.path"] === undefined && typeof full === "string") {
    try {
      const u = new URL(full);
      a["url.path"] = u.pathname + u.search;
    } catch {
      // Not a full address: the span's name stays its path.
    }
  }
  const route = a["http.route"];
  if (typeof route === "string" && route && !route.startsWith("/")) a["http.route"] = `/${route}`;
}

/** A server span named by its method and a route with no leading slash ("GET report") takes the slashed route, as its route does. */
export function serverName(name: string, a: Attributes): string {
  const route = a["http.route"];
  const method = a["http.request.method"];
  if (typeof route !== "string" || typeof method !== "string" || !route.startsWith("/")) return name;
  return name === `${method} ${route.slice(1)}` ? `${method} ${route}` : name;
}

/** `http.target` holds the path and the query: split them into `url.path` and `url.query`. A server span fills a missing path first. */
export function splitTarget(a: Attributes, server = false): void {
  if (server) serverPath(a);
  const path = a["url.path"];
  if (typeof path !== "string") return;
  const q = path.indexOf("?");
  if (q < 0) return;
  a["url.path"] = path.slice(0, q);
  if (a["url.query"] === undefined) a["url.query"] = path.slice(q + 1);
}
