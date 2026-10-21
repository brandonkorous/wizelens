---
title: Insights
description: The problems WizeLens looks for in every trace, the rules it uses, and how to change them.
---

The same rules run in .NET, in Node, and on the hub and the cloud for OpenTelemetry services (Java, Python, Go), so every
service gives the same answer. Insights show in the HUD, on each trace, and ranked on the **Insights** page.

## N+1 query

The same SQL statement runs **5 or more times** in one trace, whatever its parameters. The usual cause: a loop that loads
one row at a time.

**Fix:** load all the rows with one query: a join, `IN (...)`, or your ORM's include.

## N+1 HTTP call

**5 or more** outgoing HTTP calls in one trace with the same method, host, and path shape. Numbers, GUIDs, and query values
in the path count as the same shape, so `/orders/1` and `/orders/2` match.

**Fix:** add a batch endpoint, or ask for everything in one call.

## Duplicate query

The same statement runs **2 or more times** in one trace with the **same parameters**. The second run gives you nothing new.

A statement with placeholders (`?`, `$1`, `%s`, `:name`, `@name`) but no captured parameters is never a duplicate: two
runs may have had different values. The plain OpenTelemetry agents leave the parameters out; the [Java](/docs/java/),
[Python](/docs/python/), and [Go](/docs/go/) SDKs put them back.

**Fix:** keep the first result, or cache it for the request.

## Slow query

One query takes **100 ms or more**.

**Fix:** look at the query plan. Add an index, or ask for less.

## Database wait

**3 or more slow queries** in one trace that overlap in time count as one database wait, not three slow queries. So does a
slow session statement on its own (a `SET` does almost no work, so it waited). The time is wall time: queries that waited
together waited once.

**Fix:** look for locks, a full connection pool, or a busy database.

## Errors

Exceptions on the server and errors in the browser, with the stack and the request that led to them.

## Render problems

From the browser: React components that render too often, slow hydration, slow images, and layout shift. See the **Rendering** page.

## Session statements

`SET`, `RESET`, `BEGIN`, `START TRANSACTION`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`, `DISCARD`, and `USE` are
never counted as duplicates or N+1. Apps that run `SET LOCAL app.tenant_id` before each query repeat them by design.

## Fixed and dismissed

On the hub and the cloud, an insight works like an [error group](/docs/errors/). Open one on the **Insights** page and:

- **Mark fixed** when you changed the code. If it shows up again, it comes back as **Regressed**.
- **Dismiss** it for 1 hour, 1 day, 1 week, or for good, when it is by design.
- **Reopen** a fixed or dismissed one.
- In the cloud, pick an **Assignee** from your team.

The **Status** filter shows Open (the default), Fixed, Dismissed, or All Statuses. Pick a service, and the **Release**
filter shows only the insights that are **New in** that version. **Area** (database, HTTP, rendering), **Impact**, and
search narrow the list further, and **Export** downloads it as CSV.

## Change the rules

| Rule | .NET | Node | Default |
|---|---|---|---|
| N+1 repeats | `NPlusOneThreshold` | `nPlusOneThreshold` | `5` |
| Slow query | `SlowQueryMs` | `slowQueryMs` | `100` |

On the hub and the cloud, set both per project under **Settings → This project** (they apply to data that arrives after
you save), or for the whole host at start with `--slow-query-ms` and `--n-plus-one`.
