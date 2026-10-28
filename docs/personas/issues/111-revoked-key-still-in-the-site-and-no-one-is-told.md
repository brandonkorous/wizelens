# 111 — Her site sends with a revoked key, and the cloud does not tell her

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · standing check: wrong move (delete the browser key the live site uses)
**Surface:** browser intake; Connect › Sending keys; team notices
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 re-run, 2026-10-28 00:24 (phone 390, dark); P02 Greta Connect re-check 00:22

## What happened

At 00:14 Noor revoked `brandonk.dev — public site (script tag)`, the key in her live site's tag. The dialog warned
her well ("It was used 3m ago, so something still uses it… use Rotate instead"). Then a visitor opened / and
/contact: the site worked and showed no error, which is right, but each visit was refused (401) and lost. Connect,
Overview and the bell said nothing about it. The key was gone from the list, so nothing on any screen showed that
her site still sends with it. A secret key in a page is caught and shown; a revoked browser key was not.

## What should have happened

The cloud notices that a page on one of the key's own sites still sends with the revoked key, and tells her where to
look: on Connect, and in the team notices, with the site, the time, and what to do.

## The fix

- The browser intake (`cloud/src/routes/browser.ts`) now looks a refused token up among revoked browser keys
  (`revokedBrowserKey` in `repo/keys.ts`). When the page is on one of that key's own sites, it writes the audit line
  `key.revoked_use` (once an hour per key, `noteRevokedUse` in `repo/key-exposed.ts`) and answers "This browser key
  was revoked. Put the script tag of a new browser key in this site." Another site still gets the plain answer.
- `GET api/orgs/<id>` returns `revokedInUse` (last 7 days) for owners and admins. Connect › Sending keys shows a
  warning per key with the site, the time, and what to do. It goes away once a live browser key for that site sends.
- `key.revoked_use` is a team notice, so owners and admins get an email too. New index `ix_audit_key_revoked_use`.
- Test: `browser-keys.test.ts` "tells the owners, once an hour, when a site still sends with a revoked browser key".

## Confirmation

- 00:17, Noor's phone (390): a visitor opened / and /services with the revoked key. Connect › Sending keys showed:
  "brandonk.dev — public site (script tag) was revoked, but a page on http://localhost:4173 still sent with it 6s ago.
  WizeLens refuses that data, so those visits are not recorded. Make a browser key for that site and put its script
  tag in its pages." The team email said the same.
- 00:23–00:24: she made a new browser key, put it in index.html, rebuilt, and a visitor opened / and /contact.
  Rendering (15 min) listed both pages, the key row said "31s ago", and the warning was gone.
- Rule 7, 00:22: Greta's Connect › Sending keys shows no warning (she has no revoked key in use).
