# 129 — José-Luis opened a Member Portal link and was shown the loan desk's numbers without a word

**Status:** fixed
**Severity:** minor
**Found by:** P05 · Kaweah Valley Credit Union · act 6, least access
**Surface:** every page opened from a link with `project=` (the shell)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 José-Luis at 360 dark, touch, 02:39; P02 Greta and P05 Marisol 02:40

## What happened

Marisol pasted José-Luis a Services link for `Member Portal (staging)` (he has no access to it, on purpose). The page
opened as Services with "Requests Served 122, Error Rate 3.28%", which are the loan desk's numbers: the dashboard had
quietly switched to the one project he may open. Nothing said so. The only hint was the project name, cut to "Loan
Desk …" in the top bar. He could report the loan desk's error rate as the portal's.

Access itself held: nothing of the portal showed, a trace link said "This request is not in this project, or it is no
longer stored", and search found nothing.

## The fix

`ui/src/data/account.ts`: when the link's project is not one the person may open, the dashboard notes it
(`useMissedProject`). `ui/src/shell/MissedProjectBanner.tsx` (in `App.tsx` under the email banner) says "The link was for a
project you cannot open, so you see Loan Desk API." with Close. It names no other project, so it leaks nothing.

## Confirmation

- 02:39, José-Luis (360, dark, touch) opens the Member Portal Services link: the note shows above Services, readable; Close
  removes it; a reload does not bring it back.
- 02:40, José-Luis opens P02 Greta's Requests link (another organization): the same note, only `/api/loans/…` rows; search
  "kanninja" finds nothing.
- Rule 7, 02:40: P02 Greta (p02mac) and Marisol open Overview and Requests in their own projects: no note.
