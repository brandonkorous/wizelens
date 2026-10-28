# 117 — Single sign-on cannot be made the only way in

**Status:** fixed
**Severity:** blocker (act 4)
**Found by:** P05 · Kaweah Valley Credit Union · act 1, the checklist
**Surface:** site Pricing and Docs › Cloud › Single sign-on and SCIM; cloud People & access › Single sign-on
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 act 4, People & access › Single sign-on and the sign-in page at 1440, 02:05–02:11

## What happened

Marisol's first question is "Can I make SSO the only way in?" Pricing lists "SAML and OIDC single sign-on" on
Business, and the docs say how to connect it. Neither says whether people at her domain can still sign in with a
password. The code has no such setting: once SSO is on, a person at `kaweahvalleycu.test` can still sign up and
sign in with a password, and a leaver disabled in Keycloak keeps that way in.

## What should have happened

An owner or admin turns on "Require single sign-on" for a verified domain. Then a password sign-in, a password
sign-up and a password reset for that domain are refused with a sentence that says to use "Sign in with SSO". An
owner keeps a way back in when the identity provider is down, and the docs and Pricing say so.

## The fix

- `cloud/src/auth/sso-required.ts`: password sign-in, password reset and sign-up at a required domain are refused
  (`SSO_REQUIRED`, the sentence names "Sign in with SSO"); a session made outside the provider's routes (passkey, a
  confirmed-email link) is refused too. Owners keep their password, as the way back in when the provider is down.
- Column `sso_providers.sso_required` (migration in `db/schema-sso.ts`). Route `PATCH api/orgs/:org/sso/:provider`
  (`routes/sso.ts`): managers, Business, proven domain only; it signs out everyone at the domain except owners and writes
  `sso.require` to the audit log.
- UI: a "Require single sign-on" box on a proven provider (`ui/src/pages/people/SsoRequired.tsx`), with a dialog that says
  who is signed out and what is refused, and a result line with the count.
- Two defects found while proving it, fixed in the same change:
  - **The domain proof never reached private DNS.** `--dns-servers` (new) set Node's resolver, but code that had already
    imported `node:dns/promises` (Better Auth's check) kept the old one, so the check said "Unable to verify" while the TXT
    record was there. `cli.ts` now calls `syncBuiltinESMExports()` after `setServers`.
  - **Aoife was locked out.** She had made a password account before single sign-on and never confirmed its email. After the
    rule, her password was refused, and SSO said "An account with this email already exists. Sign in with your password".
    At a required domain the SSO sign-in now links such an account, marks the email confirmed (the company's identity
    provider proved it), and ends its unproven password and passkeys, so a stranger who pre-made the account keeps nothing
    (`linkAtRequiredDomain`, Better Auth `resolveUser`). Owners keep theirs.
- Tests: `auth/sso.test.ts` "requiring single sign-on for a domain" (3 tests). Docs › Cloud › Single sign-on and SCIM, the
  options table (`--dns-servers`), and CONTRACT.md.

## Confirmation

- 02:00, Marisol: Check DNS now → "Domain proven", and the "Require single sign-on" box appears.
- 02:05, Marisol ticks it: dialog "Require single sign-on for kaweahvalleycu.test? Everyone at kaweahvalleycu.test except
  owners is signed out now…"; after confirm, "Required. 2 people were signed out and sign in again with single sign-on."
- 02:06, Aoife: her open tab is back at the sign-in page; her password and "Forgot password?" both say "People at
  kaweahvalleycu.test sign in with single sign-on. Choose "Sign in with SSO" and enter your kaweahvalleycu.test email."
- 02:06, Hannah's "Create account" with a password: the same sentence. Marisol (owner) signs in with her password.
- 02:11, Aoife: Sign in with SSO → Keycloak → she is in, and the org menu lists "Kaweah Valley Credit Union — IT".
- Pricing (5190) and Billing plan cards now read "SAML and OIDC single sign-on, required if you choose".
- Rule 7, 02:12, P02 Greta (p02mac, 1440): password and two-step code still sign her in to her org.
