# 135 — A person Marisol removed was back in, with every project, after one SSO sign-in

**Status:** fixed
**Severity:** blocker (offboarding did not hold)
**Found by:** P05 · Kaweah Valley Credit Union · act 10, the 3-month project ends
**Surface:** People & access › Members (Remove), Single sign-on
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol, Lars Øberg (temp03, 360 dark touch), Kalani (temp04), Hannah, 03:24; P02 Greta 03:25

## What happened

03:15:15 Marisol ticked the five temps and pressed Remove; the list went to 5 people. 03:15 Ngozi Eze (temp02), still
enabled in Keycloak, pressed Sign in with SSO and landed on Overview of Kaweah Valley Credit Union — IT with **All projects
2/2**: a removed temp was a member again, with more access than José-Luis. The audit log said only "Joined kvcu".
The SSO panel even said why: "New people join as members." Everyone removed at a proven domain was one sign-in from back in.

## Why

Better Auth's SSO plugin adds anyone who signs in through the organization's provider and is not a member. It cannot tell
"new" from "removed".

## The fix

- `cloud/src/auth/sso-join.ts` (new): our join step, run on every SSO sign-in (`provisionUser`, plugin provisioning off).
  It adds a person as a member unless they are in already, have a pending invite (the invite adds them), or are in the new
  table `sso_removed`; a removed person is refused and the audit log says `sso.join_refused` with their email.
- `cloud/src/auth/hooks.ts`: Remove and Leave write the person to `sso_removed`; accepting an invite takes them off it.
- Migration (`SSO_REMOVED_MIGRATION`): the table, plus removals already in the audit log for people not back in, so people
  removed before the fix stay out too.
- Copy: the SSO panel ("someone you remove needs a new invite"), audit text "Not added back: removed people need a new invite",
  `site/content/docs/cloud.md`, `docs/CONTRACT.md`.
- Tests: `sso.test.ts` "does not add back a person an owner removed, until they accept a new invite" (12/12);
  `sso-removed.test.ts` for the migration's backfill.

## Confirmation

- 03:21:46 Marisol removed Ngozi again; Ngozi's SSO sign-in: "You are not in an organization … open an invite link from your
  team." Audit: "Not added back: removed people need a new invite · p05.temp02@… · kvcu".
- Local backfill (same SQL as the migration): Priya and temps 01, 02, 04, 05; not temp03, who was back in.
- 03:24:11 Marisol removed Lars Øberg (temp03) again. His SSO sign-in at 360, dark, touch, and Kalani's (temp04, removed only
  before the fix): both "You are not in an organization"; two audit rows.
- Hannah (still a member) signed in with SSO at 03:24 straight to the org. Rule 7, 03:25: Greta's org opens unchanged.
