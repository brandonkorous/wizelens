# 084 — A secret key in a public page is refused in silence

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 3
**Surface:** Cloud › Connect › Sending keys; the static site's script tag
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P04 · act 3 on a 390 px phone; RULE #7 on P02 Greta's Sending keys
**Blocked on:** —

## What happened

Noor put the ingest key `brandonk.dev — first try` (`wl_ik_…`, a secret for servers) in her site's script tag, built
the site, and opened Home and About on her phone. The pages sent to the cloud with that key. Nothing came of it, and
nothing said why: the page shows no message (she has no console on a phone anyway), the Overview says only "Nothing
has arrived in this range", the key's row in Sending keys says "Last used: Never", and no email came. Her secret key
is now in a public page, and nothing told her to change it.

## What should have happened

The cloud knows the key, so it knows a secret key was used from a page. It refuses the data and tells her: on the
key's row ("Seen in a page on http://localhost:4173: rotate it, and put a browser key in pages") and by email to the
organization's owners.

## Where it lives

`js/packages/cloud/src/routes/browser.ts`: the intake path only matches `wl_bk_` keys, so a page posting with
`wl_ik_` falls through to the general routes and nothing records it.

## The fix

The cloud now catches `wl_ik_` and `wl_rk_` keys on the page path too (`routes/browser.ts`). It refuses the data
with "This is a secret key: it must never be in a page. Rotate it, and send from pages with a browser key (wl_bk_)."
and writes one `key.exposed` audit line an hour per key, with the page's site (`repo/key-exposed.ts`, a partial
index in `KEY_EXPOSED_MIGRATION`, tested on a fresh PGlite folder by the cloud tests). That line is a team notice, so
owners and admins get an email. The organization's key list carries `exposed`, and Sending keys shows a red box and a
"Seen in a page" badge while the secret still works. Rotating such a key stops the old secret at once (no 24-hour
grace), and the warning goes away. New test: `browser-keys.test.ts` "refuses a secret key in a page, and tells its
owners once an hour".

## Confirmed by

2026-10-27, by 21:25, as Noor on a 390 px phone, with the ingest key still in her site's tag: opened Home and About.
Sending keys showed "brandonk.dev — first try is a secret key, and a public page on http://localhost:4173 sent with
it 7s ago. WizeLens refused that data. Rotate the key, and put a browser key in pages." and the row badge "Seen in a
page". The cloud log has the mail to p04.noor@haddadstudio.test with the same sentence. Rotate asked "The old secret
was in a public page, so it stops at once."; after it, the old row says Expired and the red box is gone. RULE #7:
Greta's Sending keys show no warning, and her two kanninja keys are listed as before.
