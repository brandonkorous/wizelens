// Security facts: the sec* kinds (risks by kind and shape, their endpoints and users) and sec.auth (sign-in failures by address).
import type { Finding } from "../analysis.js";
import { findSecurity, securityOf } from "../security/index.js";
import { normalizeQuery } from "../stats/common.js";
import { displayService } from "../stats/errors.js";
import type { RequestRow } from "../stats/requests.js";
import type { Trace } from "../types.js";
import { type Contribution, contribution, withServices } from "./agg.js";
import { joinKey } from "./kinds.js";
import { traceServices } from "./facts-services.js";

/** What the newest item of a `sec` row keeps. */
export interface SecurityTop {
  kind: Finding["kind"];
  shape: string;
  severity: Finding["severity"];
  title: string;
  endpoint: string;
  traceId: string;
  startMs: number;
}

/** The shape a risk groups by: SQL with its literals as `?`, so one concatenated query is one risk. */
export const securityShapeOf = (f: Pick<Finding, "kind" | "shape">): string => (f.kind === "sql-injection" ? normalizeQuery(f.shape) : f.shape);

/** Security group key, `kind|shape`, as insights key theirs. */
export const securityKeyOf = (f: Pick<Finding, "kind" | "shape">): string => `${f.kind}|${securityShapeOf(f)}`;

/** Paths that sign people in: their answers count toward `auth-guessing`. */
export const AUTH_PATH = /login|signin|sign-in|logon|auth|token|session|password|otp|2fa|mfa|verify/i;

function riskContributions(trace: Trace, findings: readonly Finding[], endpoint: string, user: string | null): Contribution[] {
  return findings.flatMap((f) => {
    const key = securityKeyOf(f);
    const data: SecurityTop = { kind: f.kind, shape: securityShapeOf(f), severity: f.severity, title: f.title, endpoint, traceId: trace.traceId, startMs: trace.startMs };
    return [
      contribution("sec", key, trace.startMs, { c: [f.count], top: { rank: trace.startMs, data } }),
      contribution("sec.ep", joinKey(key, endpoint), trace.startMs),
      ...(user ? [contribution("sec.u", joinKey(key, user), trace.startMs)] : []),
    ];
  });
}

/** A sign-in answer: `service|endpoint|address`, failures (401, 403) as err, and 429s as c0. */
function authContributions(trace: Trace, r: RequestRow): Contribution[] {
  const status = r.status ?? 0;
  const failed = status === 401 || status === 403;
  if (!failed && status !== 429 && !AUTH_PATH.test(r.path.split("?")[0]!)) return [];
  const top = failed ? { top: { rank: trace.startMs, data: { traceId: trace.traceId } } } : {};
  return [contribution("sec.auth", joinKey(displayService(r.service), r.endpoint, r.clientAddress ?? ""), trace.startMs, { err: failed ? 1 : 0, c: [status === 429 ? 1 : 0], ...top })];
}

/** Everything a trace adds to the security rollups. A request's findings come from its row; a job's from the trace. */
export function securityFacts(trace: Trace, row: RequestRow | null): Contribution[] {
  const findings = row ? securityOf(row.findings) : findSecurity(trace);
  const services = row ? [row.service, ...row.services].map(displayService) : traceServices(trace);
  const risks = riskContributions(trace, findings, row?.endpoint ?? trace.rootName, row?.user ?? null).flatMap((c) => withServices(c, services));
  return [...risks, ...(row ? authContributions(trace, row) : [])];
}
