# 028 — Database tells me what "slow" means but not where to change it

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 5
**Surface:** Cloud › Database
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 5 — Database head now reads "Slow means ≥ 250 ms · Change"; Change opens `#/organization/checks` with 250 and 8 filled in. Fits on one line at 360px.
**Confirmed by (P01, RULE #7):** Database on `localhost:3000/_wizelens` reads "Slow means ≥ 100 ms · Change"; Change opens `#/connect/options`, the in-app home of the limits (Dashboard · in-app › Database)
**Blocked on:** —

## What Greta saw

Act 5 is "set slow query to 250 ms". She went to Database first, because that is where slow queries are.
The chart legend said "Slow queries (≥ 100 ms)" and the Query page said "Slow (≥ 100 ms)", but nothing on
either screen led to the setting. She found it on the third page she tried: Organization › Thresholds and
hidden keys. The same limit is also named three ways ("Slow query (ms)", "Slow (≥ …)", "Slow queries (≥ …)").

## Where it lives

`ui/src/pages/database/DatabasePage.tsx` showed the limit only inside chart labels. The place to change it
depends on the mode (cloud: Organization; hub: Settings; in-app: the add-on options in code), and that
rule was written inline in `connect/ServerSetup.tsx` only.

## Fix

- `routes.ts` `checksHref(mode)`: the one rule for where limits are changed. `ServerSetup.tsx` uses it.
- Database page head: "Slow means ≥ {limit} · Change", linking there.
