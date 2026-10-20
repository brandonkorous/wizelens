// Security groups from rollups: risks (sec, sec.ep) and failed sign-ins by endpoint (sec.auth).
import type { Agg } from "../scale/agg.js";
import type { SecurityTop } from "../scale/facts-security.js";
import { splitKey } from "../scale/kinds.js";
import type { Need, NeedResults, WindowRef } from "../scale/needs.js";
import { OWASP_OF, type OwaspId, type SecurityKind } from "../security/kinds.js";
import type { Impact } from "../stats/common.js";
import { byDesc, groupNeed, rowsOf } from "./read.js";
import { describeSecurity } from "./security-text.js";

export type SecuritySeverity = "error" | "warning" | "info";

/** One security risk, seen in one or more requests, grouped by kind and shape. */
export interface SecurityGroup {
  key: string;
  kind: SecurityKind;
  owasp: OwaspId;
  severity: SecuritySeverity;
  impact: Impact;
  title: string;
  description: string;
  shape: string;
  /** Requests (or traces) that had it. */
  occurrences: number;
  /** Times found over all of them: queries, cookies, markers, failed sign-ins. */
  count: number;
  /** Newest first. */
  endpoints: string[];
  firstSeenMs: number;
  lastSeenMs: number;
  /** Null for failed sign-ins when none is kept. */
  exampleTraceId: string | null;
  /** Failed sign-ins only: addresses that failed 10 or more times. */
  addresses: number | null;
}

/** Failures from one address in the window that make a sign-in endpoint a risk, and the count that makes it high. */
export const AUTH_GUESSES = 10;
export const AUTH_GUESSES_HIGH = 100;

const IMPACT: Record<SecuritySeverity, Impact> = { error: "high", warning: "medium", info: "low" };
const IMPACT_RANK: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

/** Most important first: impact, then requests, then newest. */
export const compareSecurity = (a: SecurityGroup, b: SecurityGroup): number =>
  IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.occurrences - a.occurrences || b.lastSeenMs - a.lastSeenMs || (a.key < b.key ? -1 : 1);

const ids = (win: WindowRef) => ({ sec: `sg.${win}.sec`, ep: `sg.${win}.sec.ep`, auth: `sg.${win}.auth` });

/** Needs for the security groups of one window, for one service or all. */
export function securityNeeds(win: WindowRef, service?: string): Need[] {
  const id = ids(win);
  const one = service ? { service } : {};
  return [groupNeed(id.sec, "sec", win, { top: true, ...one }), groupNeed(id.ep, "sec.ep", win, one), groupNeed(id.auth, "sec.auth", win, { top: true })];
}

function endpointsByGroup(d: NeedResults, id: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { key } of [...rowsOf(d, id)].sort(byDesc((r) => r.agg.lastMs))) {
    const [group = "", endpoint = ""] = splitKey(key);
    out.set(group, [...(out.get(group) ?? []), endpoint]);
  }
  return out;
}

function riskGroup(key: string, a: Agg, endpoints: string[]): SecurityGroup {
  const top = a.top as SecurityTop;
  const kind = top.kind as SecurityKind;
  const eps = endpoints.length ? endpoints : [top.endpoint];
  const base = { key, kind, owasp: OWASP_OF[kind], severity: top.severity as SecuritySeverity, impact: IMPACT[top.severity as SecuritySeverity], title: top.title };
  return { ...base, description: describeSecurity(kind, top.shape, eps[0]!), shape: top.shape, occurrences: a.n, count: a.c[0] ?? 0, endpoints: eps, firstSeenMs: a.firstMs, lastSeenMs: a.lastMs, exampleTraceId: top.traceId, addresses: null };
}

interface AuthEndpoint {
  service: string;
  endpoint: string;
  rows: { address: string; agg: Agg }[];
}

function authEndpoints(d: NeedResults, id: string, service?: string): AuthEndpoint[] {
  const out = new Map<string, AuthEndpoint>();
  for (const r of rowsOf(d, id)) {
    const [svc = "", endpoint = "", address = ""] = splitKey(r.key);
    if (service && svc !== service) continue;
    const e = out.get(`${svc}|${endpoint}`) ?? { service: svc, endpoint, rows: [] };
    out.set(`${svc}|${endpoint}`, { ...e, rows: [...e.rows, { address, agg: r.agg }] });
  }
  return [...out.values()];
}

/** An endpoint where one or more addresses failed to sign in `AUTH_GUESSES` times or more. */
function authGroup(e: AuthEndpoint): SecurityGroup | null {
  const guessing = e.rows.filter((r) => r.agg.err >= AUTH_GUESSES);
  if (guessing.length === 0) return null;
  const failures = guessing.reduce((t, r) => t + r.agg.err, 0);
  const limited = e.rows.some((r) => (r.agg.c[0] ?? 0) > 0);
  const newest = guessing.reduce((a, b) => (b.agg.lastMs > a.agg.lastMs ? b : a));
  const what = `${guessing.length} ${guessing.length === 1 ? "address" : "addresses"} failed to sign in ${failures} times at ${e.endpoint}.`;
  const advice = limited ? " Lock out an account after repeated failures." : " No answer was 429 (Too Many Requests), so there may be no rate limit. Add one, and lock out after repeated failures.";
  return {
    key: `auth-guessing|${e.service}|${e.endpoint}`, kind: "auth-guessing", owasp: "A07", severity: "warning", impact: failures >= AUTH_GUESSES_HIGH ? "high" : "medium",
    title: limited ? "Many failed sign-ins from one address" : "Many failed sign-ins, and no rate limit seen", description: what + advice, shape: e.endpoint,
    occurrences: failures, count: failures, endpoints: [e.endpoint], firstSeenMs: Math.min(...guessing.map((r) => r.agg.firstMs)), lastSeenMs: newest.agg.lastMs,
    exampleTraceId: (newest.agg.top as { traceId?: string } | null)?.traceId ?? null, addresses: guessing.length,
  };
}

/** The security groups of a window, most important first. */
export function securityGroupsOf(d: NeedResults, win: WindowRef, service?: string): SecurityGroup[] {
  const id = ids(win);
  const endpoints = endpointsByGroup(d, id.ep);
  const risks = rowsOf(d, id.sec).map((r) => riskGroup(r.key, r.agg, endpoints.get(r.key) ?? []));
  const auth = authEndpoints(d, id.auth, service).map(authGroup).filter((g): g is SecurityGroup => g !== null);
  return [...risks, ...auth].sort(compareSecurity);
}
