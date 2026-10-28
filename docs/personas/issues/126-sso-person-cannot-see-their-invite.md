# 126 — Hannah signed in with SSO and was told she is in no organization, with her invite waiting

**Status:** fixed
**Severity:** major
**Found by:** P05 · Kaweah Valley Credit Union · act 5, people
**Surface:** the "You are not in an organization" screen, after Sign in with SSO
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Hannah at 1440 light, José-Luis at 360 dark, 02:18–02:22

## What happened

Marisol invited Hannah as a viewer (the auditor must not change anything). IT told everyone "sign in to WizeLens
with SSO". Hannah did, and got "You are not in an organization. Make an organization, or open an invite link from
your team." Her invite was waiting for that exact email, but the screen did not show it, and the cloud here sends no
mail, so she had no link. The obvious button was "Make an organization": the wrong door.

## Why

Better Auth does not auto-join a person who has a pending invite (so the invite's role wins: right). But nothing
showed a signed-in person their own invites; the route that lists them is off without real mail, because then the
email is not proven.

## The fix

- `cloud/src/routes/me.ts`: `GET api/me/invites` lists the pending invites for the signed-in email, only when the email
  is proven (confirmed, or by single sign-on). Test in `auth/sso.test.ts`.
- `ui/src/shell/auth/NoOrgScreen.tsx`: with invites, the title is "Your team invited you" and each one shows the
  organization, the role and who sent it, with **Join** (to the invite page). Styles `.wl-noorg-invite*` in account.css.

## Confirmation

- 02:18, Hannah (1440, light): "Your team invited you … Kaweah Valley Credit Union — IT as viewer, from Marisol
  Teixeira-Wójcik [Join]". Join → "Join Kaweah Valley Credit Union — IT as viewer" → Join → in the org.
- 02:19, José-Luis (360, dark, touch): the same card, readable, Join reachable by thumb.
- 02:22, Priya and the five temps: each SSO sign-in, then Join, lands in the org.
- Rule 7: the no-org screen is only shown to people in no organization; P02 Greta signs in to her org unchanged (02:12).
