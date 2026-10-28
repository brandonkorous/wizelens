# 083 — A new browser key gives code words, not the script tag to paste

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 2
**Surface:** Cloud › Connect › Sending keys › New sending key (Browser)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P04 · act 2 on a 390 px phone; RULE #7 on P02 Greta's Setup steps
**Blocked on:** —

## What happened

Noor made the browser key `brandonk.dev — public site (script tag)` on her phone. The box under the key said:
"It is public: it goes in your page code, as endpoint={cloudEndpoint(key)} or <script data-key="key">." She does not
read code. The tag is not whole (no `src`), and this cloud is not app.wizelens.com, so a tag with only `data-key`
would send to the wrong place: the docs say a self-hosted cloud needs `data-endpoint` too, which the box does not say.
Also, the Name box went empty when the key appeared, so nothing on the screen said which key this was.

## What should have happened

The box gives the whole tag, with her key and this cloud's address already in it, and one Copy button. The key's
name stays on screen.

## Where it lives

`js/packages/ui/src/pages/connect/KeyForm.tsx`: `WHERE.browser` is one sentence for every case, and `create` clears
`name` when the key comes back.

## The fix

`KeyForm.tsx`: a new browser key's box shows the key's name, the key, "It is public: it is safe in a page. Put this
tag in every page, before </body>:", and a **Script tag** line with its own Copy button: the CDN `src`, `data-key`
with her key, `data-endpoint` with this cloud's address (left out on WizeLens Cloud itself), and `data-hud="false"`.
The box scrolls into view when the key appears, so on a phone it is not under the form. The copy line moved to
`connect/Snippet.tsx`, shared with Setup steps.

## Confirmed by

2026-10-27, by 21:13, as Noor on a 390 px phone: Connect › Sending keys › New sending key › Browser, name
`brandonk.dev — public site (script tag)`, site `http://localhost:4173`, Create key. The dialog moved down to the box
by itself: the name in bold, the key, the sentence, and the full tag with `data-endpoint="http://localhost:5970"`.
The two keys made before the fix were revoked from the list ("Revoke brandonk.dev — public site (script tag)? Pages
that send with this key stop being recorded at once."). RULE #7: Greta's Setup steps still show all 6 copy lines, each
with its Copy button.
