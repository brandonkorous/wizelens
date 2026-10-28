# 131 — Priya was turned off in Keycloak and kept reading member data in her open WizeLens tab

**Status:** fixed
**Severity:** blocker (a security exposure)
**Found by:** P05 · Kaweah Valley Credit Union · act 7, the leaver
**Surface:** single sign-on sessions; People & access › Single sign-on; Audit log
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Priya and Marisol at 1440, 02:52–02:57

## What happened

Priya leaves. Marisol does what every IT admin does: she disables Priya in Keycloak (02:45:52). A new sign-in failed at
Keycloak ("Account is disabled"), but Priya's open WizeLens tab kept showing Requests at 02:46:02 and would have kept
working: a session lasts 14 days and each day of use extends it. With SCIM unavailable (Keycloak has no SCIM client), the
only way to end it was to remember a second step in WizeLens. Nothing on the Single sign-on panel or in the docs said so.
At a credit union that is a leaver with access to member data.

## The fix

- `cloud/src/auth/sso-recheck.ts`, a job every 5 minutes (`jobs.ts`): each OIDC sign-in with a live session renews its
  refresh token at the provider. `invalid_grant` (turned off, or the provider session ended) ends all the person's sessions,
  their connected AI apps in that organization, and the stored tokens, and writes `sso.signed_out` to the audit log. A
  provider that is down or answers anything else signs nobody out. The renewed token is stored encrypted.
- Audit log: "Signed out: the identity provider ended their sign-in · Priya Venkataraman-O'Neill: 1 session and 0 connected
  apps ended · kvcu" (`auditText.ts`).
- The Single sign-on panel says "With OpenID Connect, someone you turn off there is signed out here within 5 minutes."
  Docs › Cloud › Single sign-on (with SAML's limit) and CONTRACT.md.
- Test: `auth/sso.test.ts` "a person their identity provider turned off" (renews, survives an outage, signs out once).
  The test IdP now gives refresh tokens and can be "disabled" or "down".

## Confirmation

- 02:51, the fixed cloud's first check signed Priya out (disabled since 02:45:52); the audit row says so.
- Timed run: Priya re-enabled and signed in with SSO (02:52:43); disabled again 02:52:54. Her tab still worked at 02:56:16
  and showed the sign-in page at 02:56:40: **about 3 min 45 s, at most 5 min**. Her next sign-in: Keycloak "Account is
  disabled, contact your administrator." Keys: members make none; connected apps: 0, both in the audit row.
- Hannah (SSO) stayed signed in through the checks (02:58). Rule 7: P02 Greta (password) signs in to her org unchanged (02:58).
- Dmitri (SSO, still enabled) signed in at 02:58:50 and was still signed in at 03:02:34, after the 03:01 check renewed his
  sign-in: a working person is never signed out by the check.
