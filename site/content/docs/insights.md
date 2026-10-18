---
title: Insights
description: The problems WizeLens looks for in every trace, the rules it uses, and how to change them.
---

The same rules run in .NET and in Node, so every service gives the same answer. Insights show in the HUD, on each trace,
and ranked on the **Insights** page.

## N+1 query

The same SQL statement runs **5 or more times** in one trace, with different parameters. The usual cause: a loop that loads
one row at a time.

**Fix:** load all the rows with one query: a join, `IN (...)`, or your ORM's include.

## N+1 HTTP call

**5 or more** outgoing HTTP calls in one trace with the same method, host, and path shape. Numbers, GUIDs, and query values
in the path count as the same shape, so `/orders/1` and `/orders/2` match.

**Fix:** add a batch endpoint, or ask for everything in one call.

## Duplicate query

The same statement runs **2 or more times** in one trace with the **same parameters**. The second run gives you nothing new.

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

## Change the rules

| Rule | .NET | Node | Default |
|---|---|---|---|
| N+1 repeats | `NPlusOneThreshold` | `nPlusOneThreshold` | `5` |
| Slow query | `SlowQueryMs` | `slowQueryMs` | `100` |
