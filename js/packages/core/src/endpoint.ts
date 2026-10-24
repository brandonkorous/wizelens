// One endpoint name for every page: the framework's route, else the path's shape without its query.
import { pathShape } from "./analysis.js";
import type { Span } from "./types.js";

/** `METHOD route`, or `METHOD /path/{}` when there is no route; the query never splits an endpoint. */
export function endpointName(method: string, route: string | null | undefined, path: string): string {
  if (route) return `${method} ${route}`;
  const q = path.indexOf("?");
  return `${method} ${pathShape(q >= 0 ? path.slice(0, q) : path)}`;
}

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** A server span's endpoint from its method, route, and path (else its name's path); a span with no HTTP method keeps its name. */
export function spanEndpointName(s: Span): string {
  const a = s.attributes;
  const method = text(a["http.request.method"]);
  if (!method) return s.name;
  const named = s.name.split(" ")[1];
  const path = text(a["url.path"]) ?? (named?.startsWith("/") ? named : "/");
  return endpointName(method.toUpperCase(), text(a["http.route"]), path);
}
