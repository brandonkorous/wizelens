# 029 — A sign-in ticket in the URL is stored and shown in clear

**Status:** fixed
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 3 (seen), act 6 (checked)
**Surface:** Cloud › Overview › Recent Requests, Requests, Traces (any URL or text value)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 6 — Greta emptied More hidden keys (defaults only), Dani loaded the board, and Overview › Recent Requests read `/api/v1/realtime?ticket=v1.[redacted:signed-token]`. Security › A09 now lists "Signed token in span data in GET /api/v1/realtime" (High). TS 454 tests and .NET 39 redaction/security tests pass on the shared vectors.
**Blocked on:** —

## What Greta saw

Overview › Recent Requests listed `/api/v1/realtime?ticket=v1.eyJwcm9maWxlSWQiOi…Rm5Q8vUP…` in full. The
`ticket` is kanNINJA's signed WebSocket pass: base64 JSON with Dani's profile id, board id and display name,
then a signature. Anyone in Greta's organization could copy it and open Dani's board socket until it expires.
Act 6's bar is "no password or session token appears anywhere". This one did, with the default settings.

She could hide it by adding `ticket` to More hidden keys (it then read `ticket=[redacted]`), but only
because she happened to see it. And `ticket` as a default key would also hide plain help-desk ids such as
`ticketId`, so the key list is the wrong place.

## Where it lives

`core/src/redact-values.ts` (and `dotnet/…/Storage/ValuePatterns.cs`) find secrets by shape. The JWT shape
needs two `eyJ…` parts (header and payload). A ticket of the form `v1.eyJ<payload>.<signature>` has one,
so nothing matched.

## Fix

- A `signed-token` shape in both: `eyJ` + 10 or more base64url characters + `.` + 20 or more. It runs after
  `jwt`, so a JWT keeps its own marker. `v1.eyJ….sig` becomes `v1.[redacted:signed-token]`.
- The secret leak rule names it "Signed token" (TS and .NET label maps).
- `docs/redact-vectors.json`: the ticket case, and a short `eyJ…` cursor with no signature that must stay.
- CONTRACT "Redaction" and the Security docs page list the new marker.
- Go and Python have no value patterns (their hosts redact), so nothing to change there.
