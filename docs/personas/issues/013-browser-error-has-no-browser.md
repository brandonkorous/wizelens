# 013 — A browser error's page said "No user agent recorded", so Dani could not tell which browser broke

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 7
**Surface:** Dashboard › Errors › error page › Browsers (newest 50)
**Filed:** 2026-10-26
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P01 act 7 — kanNINJA refreshed; Dani pasted the 5,000-character name into `Waiting on client` again (400, "Validation failed" at 5:49 AM), opened Errors › the error › View full error: Browsers reads "Chrome on Windows 1" and "Not recorded 7" (the 7 sent before the fix), adding up to the 8 occurrences. Seen in light, dark and at 360 px, no sideways scroll (Dashboard · in-app › Error group)
**Blocked on:** — (Brandon: do it, 2026-10-27)

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

No ClickHouse change was needed after all: rollups are generic rows (kind, key, counts), so a new kind is enough.

- `browser/src/browser-span.ts`: `user_agent.original` on `error` and `pageview` spans (not on every fetch); CONTRACT.md.
- `core/src/stats/errors.ts` `eventOf`: the request's user agent, else the error span's.
- `core/src/scale/facts-errors.ts`: a new `err.b` kind, one per occurrence by browser name (`group|Chrome on Windows`),
  over the whole range rather than the newest 50; `kinds.ts`, and `project-keys.ts` for All projects.
- `core/src/user-agent.ts`: `shortAgent` moved from the ui so facts and pages name browsers the same way.
- `core/src/models/error-page.ts` and `ErrorGroupPage.tsx`: Browsers from `err.b`; occurrences with no browser show as
  "Not recorded", never left out; data from before falls back to the newest 50 requests.
- `ui/src/ui/BarList.tsx` and `ui.css`: bar labels get 45% of the row (was 30%) and the full name as a title.
- Tests: `browser-span.test.ts`, `scale/facts-errors.test.ts`.

## Confirmed by

## Rating effect

In-app › Error group scored 8 / 8 (first score).

In-app › Error page — Ease capped at 7 until this lands.
