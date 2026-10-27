# 013 — A browser error's page said "No user agent recorded", so Dani could not tell which browser broke

**Status:** open
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 7
**Surface:** Dashboard › Errors › error page › Browsers (newest 50)
**Filed:** 2026-10-26
**Fixed:** —
**Confirmed by:** —
**Blocked on:** scope

## What happened

"ApiClientError: Validation failed" came from the browser (service "Web App", 6
occurrences). Its page said: "Browsers (newest 50) — No user agent recorded." The
browser is the one thing every browser error has.

## What should have happened

The Browsers panel lists the browsers of the newest occurrences, for browser errors too.

## Why it matters

"Only Safari" or "only the old Android WebView" is often the whole answer for a browser
error. The panel exists for that and is always empty for them.

## Where it lives

- `js/packages/browser/src/browser-span.ts` `browserSpan` — browser spans carry no
  `user_agent.original` (server spans do: CONTRACT.md `http.server` row).
- `js/packages/core/src/stats/errors.ts` `eventOf` — `userAgent: row?.userAgent ?? null`:
  only a request row gives one.
- `js/packages/core/src/models/error-page.ts` and `ui/.../ErrorGroupPage.tsx` — the
  Browsers panel counts `m.requests`, and a browser error has none (its occurrences are
  `traces`, and `TraceItem` has no user agent).

## What the fix takes (why it is blocked on scope)

1. Browser SDK: put `user_agent.original` on `error` spans (and the page view), and add it
   to CONTRACT.md's browser span attributes.
2. `eventOf`: fall back to the span's `user_agent.original`.
3. The error facts (`core/src/scale/facts-errors.ts`) keep the user agent per occurrence,
   in every store: in-app and hub memory, cloud Postgres, and the cloud's ClickHouse fact
   tables (a ClickHouse schema change, `cloud/src/telemetry/ch/schema-facts.ts`).
4. The Browsers panel counts occurrences, not requests.

Step 3 is a schema change on the cloud's live ClickHouse; bigger than this run's surface.

## The fix

## Confirmed by

## Rating effect

In-app › Error page — Ease capped at 7 until this lands.
