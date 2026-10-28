# 138 — Hannah, the auditor, could not open the audit log

**Status:** fixed (decision: every role reads and exports the audit log; chosen by the product owner 2026-10-28)
**Severity:** major
**Found by:** P05 · Kaweah Valley Credit Union · standing check "the other side" and "without a mouse"
**Surface:** People & access › Audit log
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Hannah (viewer), keyboard only, 08:48

## What happened

Hannah is the credit union's internal auditor, a Viewer by design: she reads everything and changes nothing. With the
keyboard she reached People & access and found only "Members" and "Shared links". The audit log, the one page an auditor
is there for, was owners and admins only, so the examiner's proof had to come through Marisol.

## Decision and fix

The product owner chose: every role reads and exports the audit log. Viewers already read all app data and the member list;
each export is logged with who made it.

- `cloud/src/routes/orgs.ts`: the audit list, count and facets need `read`, not `manage`.
- `cloud/src/routes/audit-export.ts`: the export needs `read` (still plan gated).
- `ui/src/pages/people/PeoplePage.tsx`: the Audit log section shows for every role.
- Test: `team.test.ts` "is read and exported by a viewer…". `docs/CONTRACT.md`.

## Confirmation

- 08:48, Hannah, keyboard only from Overview: 29 Tab presses to "People & access", Enter; 12 to "Audit log", Enter;
  1 to "Export CSV" (focus ring solid 2px blue), Enter → `wizelens-audit-2026-10-28.csv` downloaded. Its first line:
  `2026-10-28T15:48:33.619Z,Hannah Schmidt-Yamamoto,p05.hannah@kaweahvalleycu.test,audit.export`.
- Nit kept: 29 presses to reach People & access; the skip link goes to the content, not to the menu.
