# 063 — My admin's save is two half traces, in two dashboards, and nothing says where the other half is

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 7
**Surface:** In-app dashboard (.NET) › Trace detail
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 7 · Trace detail
**Blocked on:** —

## What happened

Sid changed product 1's price to 279.99 in eShop's Blazor admin (`https://localhost:5001/admin`) and saved. The admin
calls PublicApi on `https://localhost:5099`. The reply carried trace `c4d7e159…`.

- On the store's dashboard (5001) the trace is one span: `fetch /api/catalog-items`, Server "–", Network 109 ms,
  "No problems found".
- On the API's dashboard (5099) the same id is `PUT /api/catalog-items` with its `SELECT Catalog` and `UPDATE Catalog`.

Neither page joins the two or says that the other part exists. Sid's act 7 goal, one trace from click to SQL, cannot
be reached in-app.

## What should have happened

The store's trace shows the whole save: browser call, PublicApi's handler and its SQL. If it cannot, it says where the
server part is and how to join them.

## How to reproduce

1. eShop Web (5001) and PublicApi (5099), both with `AddWizeLens()`.
2. `/admin` → Edit any product → Save. Open the trace from the HUD on 5001.

## Why it matters

A Blazor WASM or SPA front end on one port and its API on another is the normal .NET layout. The browser half alone
says "No problems" over a save whose SQL is somewhere else.

## Where it lives

`Web/ClientRemote.cs` (and Node's `client-spans.ts` `remoteOf`) keep a browser span's `wizelens.browser.remote` only
on the page's own origin, so a page cannot point federation at any URL (CONTRACT "Browser spans and the server that
owns their trace"). 5099 is another origin, so the store never federates to it. That rule is right for an untrusted
page; nothing lets the developer say "5099 is mine".

## The fix

The same-origin rule stays for pages; the developer can now trust more origins.

- .NET `WizeLensOptions.TrustedRemotes`, Node `trustedRemotes`, or `WIZELENS_TRUSTED_REMOTES` (comma-separated). Each
  entry counts by its origin. `ClientRemote.Of` / `remoteOf` keep a browser span's remote on the page's origin or a
  trusted one. Tests: `PageLinkTests` (5099 trusted joins, 5100 does not), `client-remote.test.ts`.
- Trace detail (`trace/ServerElsewhere.tsx`): a trace with no server span whose browser call names an http(s) remote
  says "The server part of this call is in another app's WizeLens", links to it there, and names the option and the
  hub. In-app dashboards only.
- Docs: CONTRACT (browser remote rule, options table), README and site configuration tables.

## Confirmed by

2026-10-27 19:16, P03 Sid, before setting anything: saved product 1 at 279.98; the store's trace `8813e4e6…` showed the
note naming `https://localhost:5099`; its link opened `https://localhost:5099/_wizelens/#/traces/8813e4e6…` with
`PUT /api/catalog-items`.

19:17, Sid added `o => o.TrustedRemotes = ["https://localhost:5099"]` to `AddWizeLens` in `src/Web/Program.cs`,
restarted, saved product 1 at 279.99: the store's trace `a1b1f438…` is one trace, Services PublicApi + browser,
`fetch /api/catalog-items` 136 ms → `PUT /api/catalog-items` 133 ms → Handler → `SELECT Catalog` 43 ms,
`UPDATE Catalog` 4.2 ms; no note.
