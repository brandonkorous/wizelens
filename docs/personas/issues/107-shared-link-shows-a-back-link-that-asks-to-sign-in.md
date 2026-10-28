# 107 — A shared page has links that ask the client to sign in

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · act 10 (the other side: Rémy opens the link)
**Surface:** shared link of a detail page (route, error group, query, service, endpoint)
**Filed:** 2026-10-27
**Fixed:** 2026-10-28
**Confirmed by:** at 00:01 a signed-out reader on Rémy's link saw no in-app link at all. On Greta's shared Errors link (rule 7, the same defect: "View full error", "View affected requests" and the Critical Incidents card all led to sign-in) the two action links are gone, and a tap on the card stays on the link. Signed in, Greta's Errors still shows both links and "View full error" opens the group; Noor's route page still shows "All routes" and it works.

## What happened

Rémy's link opens one page's view. Its only link was "← All routes" at the top. It goes to Rendering, which is not
shared, so it asks him to sign in to an account he does not have. The link says "no navigation", but the page has one.

## What should have happened

A shared page has no way out that leads to a sign-in form.

## The fix

The shared page frame, one place for every page a link can show: `ui/src/pages/shared/SharedTrace.tsx` stops any
`#/` link inside it (`stayHere`, which also covers Enter), and `styles/pages/cloud.css` hides the action links
(`.wl-btn`, `.wl-back`, `.wl-view-all`, `.wl-more`) so nothing offers a way out. Cards that are links stay as cards.
