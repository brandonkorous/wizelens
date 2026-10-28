# 175 — The audit log's SCIM lines name no one when a person is turned off or deleted

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 6 (User sync, on P05's Business organization; the identity provider's calls sent as Okta sends them)
**Surface:** People & access › Audit log (and its export)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at People & access › Audit log, 1440 light, 16:49

## What happened

The identity provider added Wanjiru Kamau-Lindqvist, then turned her off. Members went from 6 to 5, but the audit
line for the turn-off read only "Identity provider (SCIM) · SCIM changed a person", with no name and no word that she
was removed. An auditor could not tell who left. The add line named her only because its body carried her email.

Two causes: a change or delete has no name in its body, and the hook read the id from `ctx.path`, which is the route
pattern, so every line stored the id `:userId`.

## Where it lives

`js/packages/cloud/src/auth/billing-hooks.ts` (`auditScim`), `js/packages/cloud/src/auth/hooks.ts`, and
`js/packages/ui/src/pages/people/auditText.ts` (`detailText`).

## Fix

The line takes the id from the route values, and the name from the body, the SCIM answer, or (for a delete) the SCIM
user read before the delete runs. A change records `active`. The log reads the name, then "turned off, so removed from
the organization" or "turned on". Test: `scim.test.ts`.

## Confirmation

- 16:49, as the identity provider: add, turn off, delete. The log reads "SCIM added a person · Wanjiru
  Kamau-Lindqvist · p05.wanjiru@kaweahvalleycu.test", then the same with "turned off, so removed from the
  organization", then "SCIM removed a person · Wanjiru Kamau-Lindqvist · p05.wanjiru@kaweahvalleycu.test".
