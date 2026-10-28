# 118 — The Traces list does not say when each trace happened

**Status:** fixed
**Severity:** design
**Found by:** P04 · Haddad Studio · scoring sweep; P02's gap "list panel is a third of the width at 1440"
**Surface:** Traces (`#/traces`), the list on the left
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta Traces at 1440, 01:05; P04 Noor Traces at 360, 01:05

## What happened

Each row showed the path, the trace id, the duration and a status dot, but no time. Noor could not tell this
morning's visit from last night's without opening each trace. At 1440 the list was a third of the width, so long
paths wrapped.

## What should have happened

A time in each row, like Requests and Errors, with the full date on hover; and room for it.

## The fix

- `ui/src/pages/traces/RecentTraces.tsx`: a Time column (`fmtTime`, the date when it is not today; `fmtDateTime` on hover).
- `ui/src/styles/pages/traces.css`: the list takes 1 part of 2.6 (at least 380 px), was 0.85 of 2.85.

## Confirmation

- 01:05, Greta at 1440: "Path · trace ID, Time, Duration, Status"; "/api/health 1:04:28 AM 6.6 ms"; the list is 439 px
  wide (was about 330), no sideways scroll (397/397).
- 01:05, Noor at 360: "/contact 1:04:28 AM 4.0 ms"; the table fits its panel.
