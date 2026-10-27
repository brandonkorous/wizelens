# 008 — The SQL tab showed Dani's live session token (and sign-in emails) in plain text

**Status:** fixed
**Severity:** blocker
**Found by:** P01 · kanNINJA web team · act 6
**Surface:** Dashboard › Trace › SQL tab · Database › query pages · every place query values show (and what the AI agent reads)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 6 — board load → HUD → GET /api/v1/boards/:boardId → SQL tab; query #1 params read ["[redacted]"]
**Blocked on:** —

## What happened

Dani opened the SQL tab of the board-load trace
(`http://localhost:3000/_wizelens/#/traces/0a3ec5ad4f9d466cb3e6b2b213a1e81f/sql`). Query #1 read:

> select "id", "user_id", "token", … from "auth_sessions" where "auth_sessions"."token" = $1
> params: ["AIJDisnqGFxkte6iHIaCitQ357eUDfdn"]

That is the session token in Dani's cookie. Anyone who can open the dashboard can
sign in as Dani. The sign-in lookup `… from "auth_users" where "auth_users"."email" = $1`
keeps the email the same way.

## What should have happened

`params: ["[redacted]"]` for any value bound to a token, password, secret or email
column. The query shape and the other values stay.

## How to reproduce

1. Any app on Better Auth (or any SQL with `"token" = $1`), traced with params on (the default).
2. Open any request that checks the session, then its SQL tab.

## Why it matters

The in-app dashboard, the hub, the cloud and the AI agent (act 10) all read these
params. A token there is a working login.

## Where it lives

`js/packages/core/src/redact.ts` — `redactParams` redacts named params by key but
keeps every positional (`$1`, `?`) value as is ("positional kept"). Callers:
`node/src/db.ts` (Node adapters), `hub/src/otlp/db-params.ts` (OTel agents).

## The fix

`redactParams(params, keys, sql)` now reads which column each positional value is bound to
(`core/src/redact-sql-params.ts` `paramColumns`: `"t"."col" = $1`, `like`/`in`, `set col = $1`, insert column lists;
`$n`, `?` and `%s` styles) and redacts it when the column is sensitive: the redact keys plus `email` for SQL
values. Every text value also goes through the secret patterns (`redactText`: JWT, cloud keys, cards). Named values
get the same rule. Both callers pass the SQL: `node/src/db.ts`, `hub/src/otlp/db-params.ts` (OTel and Python).
A redacted value no longer counts as "same parameters" in the duplicate-query check (`db-findings.ts` `paramsOf`), so
two different emails never read as one duplicate. Tests: `redact-sql-params.test.ts`, `db-findings.test.ts`
"redacted parameters". Not done: traces stored before the fix keep their values until they age out (24 h in-app).

Every SDK, one rule: named placeholders too (`@name`, `:name`, `%(name)s`; `::type` casts skipped), and the 10
`params` cases in `docs/redact-vectors.json` run in TS (`redact-vectors.test.ts`), Go (`go/sqlparams_test.go`),
Python (`tests/test_sql_params.py`) and .NET (`RedactVectorTests.cs`). Go `ParamsJSON(query, args, s)` takes the
SQL now (an exported signature change). .NET's duplicate check skips redacted parameters too
(`TraceAnalysis.ParamsOf`). Results: go test ok; pytest 35 passed; dotnet test 513 passed, 0 failed. Not done:
Python `executemany` row lists (TS has no rule for them either); Go and Python have no value patterns
(`redactText`), so only the column and name rule applies there. CONTRACT.md "Redaction" states the rule.

## Confirmed by

> Re-ran P01 act 6 after restarting both kanNINJA services on the new build: loaded the Q4 Workshop board,
> HUD details → `GET /api/v1/boards/:boardId · 7 SQL` → SQL tab (`#/traces/e96bbb3f…/sql`). Query #1
> `… where "auth_sessions"."token" = $1` read `params: ["[redacted]"]`; the user id, board id and list ids stayed.
> The email case is re-checked in act 10 (sign-up request).

## Rating effect

In-app › Trace › SQL — Design 4 → 8 (a secret on screen was the floor)
