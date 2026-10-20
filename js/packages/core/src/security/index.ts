// Security rules over one trace (docs/CONTRACT.md "Security analysis").
import type { Finding } from "../analysis.js";
import type { Trace } from "../types.js";
import { findPlainHttp, findSecretInCalls, findSecretInUrl, findSsrf } from "./calls.js";
import { findCookieFlags } from "./cookies.js";
import { findCors, findMissingHeaders, findVersionHeaders } from "./headers.js";
import { isSecurityKind } from "./kinds.js";
import { findSecretLeaks } from "./leaks.js";
import { findExposedPath, findOpenAdmin, findStackExposed } from "./paths.js";
import { securityRequest } from "./request.js";
import { findSqlInjection } from "./sql.js";

export * from "./kinds.js";
export { SECRET_LABELS, markersIn } from "./leaks.js";
export { securityRequest, type SecurityRequest } from "./request.js";
export { sqlLiterals } from "./sql.js";
export { isInternalHost } from "./calls.js";

/** Every security finding of a trace: the request's own, then outgoing calls, then leaked secrets. */
export function findSecurity(trace: Trace): Finding[] {
  const r = securityRequest(trace);
  const own = r
    ? [
        ...findSqlInjection(trace, r),
        ...findSsrf(trace, r),
        ...findExposedPath(r),
        ...findOpenAdmin(r),
        ...findMissingHeaders(r),
        ...findCors(r),
        ...findCookieFlags(r),
        ...findSecretInUrl(r),
        ...findStackExposed(r),
        ...findVersionHeaders(r),
      ]
    : [];
  return [...own, ...findSecretInCalls(trace), ...findPlainHttp(trace), ...findSecretLeaks(trace)];
}

/** The security findings of a list. */
export const securityOf = (findings: readonly Finding[]): Finding[] => findings.filter((f) => isSecurityKind(f.kind));
