// Open sensitive files and debug pages (A02), admin routes without credentials (A01), and stack traces in answers (A10).
import type { Finding } from "../analysis.js";
import type { Span } from "../types.js";
import { spanFinding } from "./headers.js";
import type { SecurityRequest } from "./request.js";

const ACTUATOR = "env|heapdump|threaddump|configprops|mappings|beans|loggers|shutdown|jolokia";

/** Sensitive files and debug pages, matched against the lower-case path. */
export const EXPOSED_PATHS = new RegExp(
  `(?:^|/)(?:\\.env(?:\\.[\\w-]+)?$|\\.git/|\\.svn/|\\.aws/|\\.ds_store$|web\\.config$|phpinfo\\.php$|server-status$|elmah\\.axd|trace\\.axd|debug/pprof|actuator/(?:${ACTUATOR})(?:/|$))`,
);

/** Stack traces of Python, Go, Java, .NET, Node, and PHP, also inside JSON (`\n` as two characters). */
export const STACK_RE = /Traceback \(most recent call last\)|goroutine \d+ \[|\.java:\d+\)|:line \d+|(?:\n|\\n)\s*at [\w.$<>`[\]]+ ?\(|(?:\n|\\n)\s*at .+ \(.+:\d+:\d+\)|Stack trace:(?:\s|\\n)*#0/;

const ADMIN_SEGMENT = /(?:^|\/)(?:admin|internal|management)(?:\/|$)/;
const SIGN_IN = /login|signin|sign-in|logon/;
/** A request header named as a credential: Authorization, Cookie, or any `*-token`, `*-auth`, `*-secret`, `*-key` header. */
const CREDENTIAL_NAME = /(?:^|[-_])(?:authorization|cookie|token|auth|secret|key|apikey)(?:$|[-_])/;
const HEADER_PREFIX = "http.request.header.";

const is2xx = (r: SecurityRequest) => r.status !== null && r.status >= 200 && r.status < 300;

export function findExposedPath(r: SecurityRequest): Finding[] {
  const path = r.path.toLowerCase();
  return is2xx(r) && EXPOSED_PATHS.test(path) ? [spanFinding("exposed-path", "error", "A sensitive file or debug page is open", path, r.span)] : [];
}

/** True when a request header is a credential by its name, or its value was redacted as one. */
export const sentCredentials = (span: Span): boolean =>
  Object.entries(span.attributes).some(([k, v]) => k.startsWith(HEADER_PREFIX) && (CREDENTIAL_NAME.test(k.slice(HEADER_PREFIX.length)) || (typeof v === "string" && v.startsWith("[redacted"))));

/** True when the request carried no credentials and no span names a user. */
export const anonymous = (r: SecurityRequest): boolean => !r.user && !sentCredentials(r.span);

export function findOpenAdmin(r: SecurityRequest): Finding[] {
  const path = r.path.toLowerCase();
  if (!is2xx(r) || !ADMIN_SEGMENT.test(path) || SIGN_IN.test(path) || !anonymous(r)) return [];
  const html = (r.header("content-type") ?? "").toLowerCase().startsWith("text/html");
  if (r.method === "GET" && (html || !r.headersKnown)) return [];
  return [spanFinding("open-admin", "warning", "An admin route answered without credentials", r.endpoint, r.span)];
}

export function findStackExposed(r: SecurityRequest): Finding[] {
  if (r.status === null || r.status < 400 || !r.body || !STACK_RE.test(r.body)) return [];
  return [spanFinding("stack-exposed", "warning", "An error answer shows a stack trace", r.endpoint, r.span)];
}
