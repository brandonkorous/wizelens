# 100 — The same uptime check can be added twice

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · act 8 (standing check: add the same uptime check twice)
**Surface:** Uptime › New check, Edit, Import URLs
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** at 22:51 on her phone she deleted the twin ("Delete Home page — every 1 min? … Delete check"), then saved the same check again: the form stays open and says "Home page — every 1 min" already checks GET http://localhost:4173/. Edit that check, or give this one another name. The list keeps one.

## What happened

She saved `Home page — every 1 min` on `http://localhost:4173/` a second time. It saved with no word. The list had two
rows with the same name, both calling her site every minute, and each outage would open two incidents and send two
alerts.

## What should have happened

A check with the same name, method, and URL as one the project has is refused, with the name of the one it repeats.
Another name on the same URL (a second check with other text) is still fine.

## The fix

`core/src/uptime/input.ts` `sameCheckProblem()`; the cloud and the hub refuse with 409 on create and change. Import
URLs goes through the same create, so a re-import lists the repeats as failed rows. Test: `input.test.ts`.
