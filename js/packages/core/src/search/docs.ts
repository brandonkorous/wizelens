// Search documents for each kind: what free words read and which value each field has.
import type { RequestItem } from "../scale/facts-lists.js";
import { displayService } from "../stats/errors.js";
import { isFailed } from "../stats/requests.js";
import { LOG_LEVELS, type LogRow } from "../stats/logs.js";
import { isErrorStatus } from "../trace.js";
import type { AttributeValue, Attributes, Span, Trace } from "../types.js";
import { numberOf, type SearchDoc } from "./match.js";

const lower = (parts: readonly (AttributeValue | undefined)[]): string[] => parts.flatMap((p) => (p === null || p === undefined || p === "" ? [] : [String(p).toLowerCase()]));

const str = (a: Attributes, key: string): string | null => (a[key] === undefined || a[key] === null ? null : String(a[key]));

const num = (v: AttributeValue | undefined): number | null => numberOf(v);

/** Error text of a span: its status message and exception messages. */
const errorTexts = (s: Span): (string | null)[] => [s.statusMessage, ...s.events.filter((e) => e.name === "exception").map((e) => str(e.attributes, "exception.message"))];

const ERROR_RANK = LOG_LEVELS.indexOf("error");

/** The path part of a path or a full URL, without the query. */
function pathOnly(u: string | null): string | null {
  if (!u || !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u?.split("?")[0] ?? null;
  try {
    return new URL(u).pathname;
  } catch {
    return u.split("?")[0]!;
  }
}

export function spanDoc(s: Span, env?: string): SearchDoc {
  const a = s.attributes;
  const url = str(a, "url.path") ?? str(a, "url.full");
  const path = pathOnly(url);
  return {
    kind: "spans",
    text: lower([s.name, url, str(a, "db.query.text"), str(a, "wizelens.db.parameters"), ...errorTexts(s)]),
    fields: {
      service: s.service, env, trace: s.traceId, span: s.spanId, name: s.name, method: str(a, "http.request.method"), path, route: str(a, "http.route"),
      status: num(a["http.response.status_code"]), outcome: s.status, duration: s.durationMs, category: s.category, kind: s.kind,
      user: str(a, "enduser.id"), error: isErrorStatus(s),
    },
    attrs: [a],
  };
}

/** A log row. Its service is the display name, so browser logs also answer to "browser", as browser spans do. */
export function logDoc(l: LogRow, env?: string): SearchDoc {
  return {
    kind: "logs",
    text: lower([l.message, l.category, l.traceName]),
    fields: { service: l.service === displayService("browser") ? [l.service, "browser"] : l.service, env, trace: l.traceId, span: l.spanId, name: l.traceName, level: l.level, category: l.category, message: l.message, error: LOG_LEVELS.indexOf(l.level) >= ERROR_RANK },
    attrs: [l.attributes],
  };
}

export function traceDoc(t: Trace, env?: string): SearchDoc {
  const errors = traceErrorTexts(t);
  return {
    kind: "traces",
    text: lower([t.rootName, t.rootUrl, ...t.services, ...errors]),
    fields: {
      service: t.services.length ? t.services : [t.service], env, trace: t.traceId, name: t.rootName, method: t.rootMethod, path: pathOnly(t.rootUrl),
      status: t.rootStatusCode, outcome: t.status, duration: t.durationMs, error: t.status === "error" || t.errorCount > 0,
    },
    attrs: t.spans.map((s) => s.attributes),
  };
}

/** Error texts of a trace's spans, for free words on requests and traces. */
export const traceErrorTexts = (t: Trace): (string | null)[] => t.spans.flatMap(errorTexts);

/** A request row; pass its trace's span attributes and error texts when the host has them. Its endpoint is "METHOD route"; path drops the query. */
export function requestDoc(r: RequestItem, attrs: readonly Attributes[] = [], env?: string, errors: readonly (string | null)[] = []): SearchDoc {
  const failed = isFailed(r);
  const route = r.endpoint.slice(r.endpoint.indexOf(" ") + 1);
  return {
    kind: "requests",
    text: lower([r.path, r.endpoint, r.user, r.requestId, r.clientAddress, ...r.tags, ...errors]),
    fields: {
      service: [r.service, ...r.services], env, trace: r.traceId, method: r.method, path: pathOnly(r.path), route, status: r.status,
      outcome: failed ? "error" : "ok", duration: r.durationMs, user: r.user, error: failed,
    },
    attrs,
  };
}
