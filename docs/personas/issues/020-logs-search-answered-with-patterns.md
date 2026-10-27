# 020 — Searching Logs for a trace answered with 52 unrelated patterns

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 11
**Surface:** Dashboard › Logs (search, Log Patterns, Log Lines) and Trace › Logs tab
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 11 — the search says the trace wrote no lines and links it; the tab says where Fastify's lines went
**Blocked on:** —

## What happened

Dani pasted the act 5 move's trace id (`d75088eb…`) into Logs ("Messages, categories, or trace IDs"). Right under the box,
"Log Patterns (52)" listed `ENOENT`, `[Fast Refresh] rebuilding`, `Server listening at …` — every pattern, unfiltered.
Further down, "Log Lines (0)" said "Try a lower level, another service, or a wider time range" — none of which was the
reason. The trace's Logs tab said "No logs were written during this request.", while the API's terminal showed two lines
for that POST (`incoming request`, `request completed`, `req-uf`).

## What should have happened

The page says the patterns are not narrowed by search text, says this trace wrote no lines, and the trace says why the
terminal's two lines are not there.

## Why it matters

One outcome, two causes: an unfiltered panel read as the search result, and "nothing here" read as "WizeLens lost my logs".

## Where it lives

`ui/src/pages/logs/LogPatterns.tsx` (patterns come from the `log.p` rollup by service, level and shape, so free text
cannot narrow them), `ui/src/pages/logs/LogsPage.tsx` (empty text), `ui/src/pages/trace/LogsErrorsTabs.tsx`, and
`node/src/logs/pino.ts` (`FASTIFY_LINES`, undocumented).

## The fix

- With search text, Log Patterns shows one line instead of its rows: "Patterns follow the level and service filters, not
  search text. The lines that match are below."
- A search that is a trace id with no lines says "No log lines in this trace · The request wrote no log lines at these
  levels. Open the trace", linking `#/traces/<id>`.
- The trace's empty Logs tab adds: Fastify's own "incoming request" and "request completed" lines are not kept: the
  timeline shows the request.
- CONTRACT.md says the Node add-on leaves those two lines out, and keeps lines the app writes with `request.log`.

## Confirmed by

> Re-ran P01 act 11: Logs, search `d75088eb9b87ea0e227ea2a6fecd7951` → "Log Patterns · Patterns follow the level and
> service filters, not search text…", "Log Lines (0) · No log lines in this trace … Open the trace" → the link opened
> `#/traces/d75088eb…`; its Logs tab gave the Fastify sentence. Then a trace that did write a line (Siobhán's sign-up,
> `6cb9c75b…`): Logs search showed `11:32:10 PM Info kanninja-backend console [email:dev] RESEND_API_KEY unset…`, and the
> trace's Logs tab showed the same line at +77 ms.

## Rating effect

In-app › Logs — Ease 6 → 7; Trace › Logs tab — Ease 7 → 8
