# 130 — Hannah, a read-only auditor, was offered Resolve, Ignore and Assign, and refused only after she pressed

**Status:** fixed
**Severity:** minor
**Found by:** P05 · Kaweah Valley Credit Union · act 6, least access
**Surface:** Errors › Error Details (and Insights, same controls)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Hannah at 1440, 02:44; P02 Greta 02:44

## What happened

Hannah is a viewer. Every other page hides what she may not do: no New alert, no keys, no save or share-link buttons, only
"Leave" on People. Errors alone offered a Resolve button, an Ignore menu and an assignee menu. She pressed Resolve and
read "Your role (viewer) cannot do this." Access held (the error stayed New), but an auditor who sees a Resolve button
writes "viewers can close errors?" in her notes, and has to press it to find out.

## The fix

`ui/src/ui/IssueControls.tsx`: for a viewer (the project role, else the organization role) the actions are replaced by
"You can read this. A member, admin or owner can resolve, ignore or assign it." Insights say "mark fixed, dismiss".

## Confirmation

- 02:44, Hannah: Errors › the "Credit bureau did not answer in 5 s (Equifax sandbox)" group shows that line, and no buttons.
- Rule 7, 02:44, P02 Greta (p02mac, member): the same panel still shows Resolve, Ignore… and her team in Assignee.
