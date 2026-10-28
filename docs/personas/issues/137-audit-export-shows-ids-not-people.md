# 137 — The examiner's export said who did what as user ids, not people

**Status:** fixed
**Severity:** major (the export is the evidence an examiner asks for)
**Found by:** P05 · Kaweah Valley Credit Union · act 11, the examiner's export
**Surface:** People & access › Audit log (Export CSV / JSON, and the list)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol 03:34–03:36; P02 Greta 03:36

## What happened

Marisol exported the log and read it as the NCUA examiner would. Every kind of change from acts 2–10 was there, with a
UTC time, but:

- **Who** was `user:0e141e3a-872a-…`, not "Marisol Teixeira-Wójcik". The examiner cannot read that without a lookup table.
- The SSO sign-out rows named Priya only as `userId`; key and access rows named projects only by id.
- "Changed a role" said `role admin` but not whose role (Dmitri).
- On the screen, every removed person showed as "Former member", and "Removed a member" did not say who was removed.

## The fix

- `cloud/src/repo/audit.ts` `withNames`: each line carries `who` (the person, by name and email, read from users, so former
  members keep their names; or the key's name) and `subject` (the person `detail.userId` names).
- `cloud/src/routes/audit-export.ts` (moved out of `billing.ts`): columns `time_utc, who, who_email, action, about, detail`;
  `about` names people, projects, keys and roles. JSON has the same fields.
- `cloud/src/auth/hooks.ts`: a role change records `memberEmail`, as a removal does.
- `ui/src/pages/people/auditText.ts` / `AuditLog.tsx`: former members show as "Ngozi Eze (former member)"; removed and
  re-roled people show their email.
- Tests: `team.test.ts` (header and a full line), `notify/team.test.ts` (role change email). `docs/CONTRACT.md`.

## Confirmation

- 03:34, Marisol's export: `2026-10-28T10:24:09.433Z,Marisol Teixeira-Wójcik,p05.marisol@kaweahvalleycu.test,member.remove,
  p05.temp03@kaweahvalleycu.test`; `…,WizeLens,,sso.signed_out,Priya Venkataraman-O'Neill <p05.priya@…>`;
  `…,project.role,José-Luis Ferreira da Costa <p05.joseluis@…>; project Member Portal (staging); role none`;
  `…,Stripe,,plan.change,…{"from":"free","plan":"business"}`; refused SSO joins by name (Ngozi Eze, Lars Øberg, Mei-Lin Chau).
- 03:36, Marisol set Aoife to Viewer and back: both rows read `p05.aoife@kaweahvalleycu.test; role viewer|member`, on screen
  "Changed a role p05.aoife@… · as member". The 09:14 row from before the fix still reads only `role admin`.
- Rule 7, 03:36: Greta's audit page lists her rows as before.
