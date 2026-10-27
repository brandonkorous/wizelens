# 044 — I cut retention from 30 to 14 days: no question, and the top bar still said 30

**Status:** fixed
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 11 (standing check: wrong moves)
**Surface:** Cloud › Organization › Data retention, and the top bar
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 11 — set 30 (no question, top bar "Cloud · kept 30 days"), then 14: "Keep 14 days instead of 30 days? Traces and logs in every project from before Oct 13, 2026 are deleted within minutes. They cannot be brought back." with Keep 30 days / Keep 14 days; after Keep 14 days the top bar read "Cloud · kept 14 days" with no reload; audit log "Changed the organization · keep data 14 days" (Cloud › Organization › Data retention)
**Blocked on:** —

## What Greta saw

She typed 14 in "Days" and pressed Save. It said "Saved." at once. Nothing asked her first or said what goes:
everything older than 14 days, in every project, deleted within minutes and gone for good. The project rows
changed to "Like the organization (14 days)", but the top bar still read "Cloud · kept 30 days", a false
sentence until she reloaded the page.

## Where it lives

- `ui/src/pages/organization/RetentionSection.tsx` saved shorter days with no question; the project
  "Traces kept" and "Logs kept" lists did the same.
- `ui/src/data/store.ts` read the host's info (which holds how long data is kept, and the slow limit) once per
  project and never again, so the top bar and range menu kept the old days after a save.

## Fix

- `shortenAsk()`: before any shorter keep time (organization, a project's traces, a project's logs) the
  question says "Keep 14 days instead of 30 days?", "Traces and logs in every project from before Oct 13, 2026
  are deleted within minutes. They cannot be brought back.", with **Keep 14 days** and **Keep 30 days**.
- `DataStore.reloadInfo()`: after the account reloads (every settings save does that), the info is read again,
  and the old one stays on screen until the new one comes.
