import type { Finding } from "./analysis.js";
import { ATTR_DB_FINGERPRINT } from "./attributes.js";
import { busyMs } from "./busy.js";
import { isNoSqlSession, isNoSqlSpan } from "./nosql.js";
import type { Span, Trace } from "./types.js";

export const queryText = (s: Span): string => String(s.attributes["db.query.text"] ?? s.name);
export const dbSpans = (t: Trace): Span[] => t.spans.filter((s) => s.category === "db");

const SESSION_RE = /^\s*(SET|RESET|BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|DISCARD|USE)\b/i;

/** Session and transaction statements (SET LOCAL, BEGIN, COMMIT, Redis MULTI, MongoDB getMore). Their repeats are by design, not N+1. A Redis SET is not one. */
export const isSessionStatement = (s: Span): boolean => (isNoSqlSpan(s) ? isNoSqlSession(s) : SESSION_RE.test(queryText(s)));

/** The queries that the N+1 and duplicate checks look at. */
export const repeatableQueries = (t: Trace): Span[] => dbSpans(t).filter((s) => !isSessionStatement(s));

// Placeholders: ? (JDBC, sanitized text), $1 (Postgres), %s and %(name)s (Python), :name, @name.
const PLACEHOLDER_RE = /\?|\$\d+|%s|%\(\w+\)s|(?<![:\w]):[A-Za-z_]\w*|@[A-Za-z_]\w*/;

/** Captured parameters, unless one was redacted: two redacted values may differ, so they tell nothing. */
const paramsOf = (s: Span): string | null => {
  const p = s.attributes["wizelens.db.parameters"];
  return typeof p === "string" && !p.includes("[redacted") ? p : null;
};

/** What tells two runs of the same query apart: the captured parameters, else the values fingerprint, else nothing. */
export const valuesOf = (s: Span): string => String(paramsOf(s) ?? s.attributes[ATTR_DB_FINGERPRINT] ?? "");

/** No captured parameters or fingerprint, and placeholders or a NoSQL call (its text never has values): two may differ, so never duplicates. */
export const hasUnknownParams = (s: Span): boolean =>
  paramsOf(s) === null && s.attributes[ATTR_DB_FINGERPRINT] == null && (isNoSqlSpan(s) || PLACEHOLDER_RE.test(queryText(s)));

/** Slow queries that run at the same time, at least this many, are one wait, not many slow queries. */
export const WAIT_MIN_QUERIES = 3;

/** The shape of every "waited together" finding, so they group as one insight. */
export const WAIT_SHAPE = "Queries that waited together";

function overlapGroups(spans: readonly Span[]): Span[][] {
  const groups: Span[][] = [];
  let end = -Infinity;
  for (const s of [...spans].sort((a, b) => a.startMs - b.startMs)) {
    if (s.startMs < end) groups[groups.length - 1]!.push(s);
    else groups.push([s]);
    end = Math.max(end, s.startMs + s.durationMs);
  }
  return groups;
}

const firstWord = (s: Span) => queryText(s).trim().split(/\s+/)[0]!.toUpperCase();

function slowFinding(s: Span): Finding {
  return { kind: "slow-query", severity: "warning", title: `Slow query: ${s.durationMs.toFixed(1)} ms`, shape: queryText(s), count: 1, totalMs: s.durationMs, spanIds: [s.spanId] };
}

// totalMs is wall time: queries that waited together waited once.
function waitFinding(spans: Span[]): Finding {
  const wall = busyMs(spans);
  const what = spans.length === 1 ? `${firstWord(spans[0]!)} took ${wall.toFixed(0)} ms` : `${spans.length} slow queries ran at the same time (${wall.toFixed(0)} ms)`;
  return { kind: "db-wait", severity: "warning", title: `${what}: they likely waited for a connection or a lock`, shape: WAIT_SHAPE, count: spans.length, totalMs: wall, spanIds: spans.map((s) => s.spanId) };
}

// Many slow queries at once, or a slow SET or BEGIN, which does almost no work of its own.
const isWait = (group: Span[]) => group.length >= WAIT_MIN_QUERIES || group.every(isSessionStatement);

/** Slow queries. Overlapping slow queries, or a slow session statement, become one "db-wait" finding. */
export function findSlowQueries(trace: Trace, thresholdMs = 100): Finding[] {
  const slow = dbSpans(trace).filter((s) => s.durationMs >= thresholdMs);
  return overlapGroups(slow).flatMap((g) => (isWait(g) ? [waitFinding(g)] : g.map(slowFinding)));
}
