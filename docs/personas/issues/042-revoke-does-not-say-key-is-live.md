# 042 — Revoke did not tell me the key was still in use

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 10 (standing check: wrong moves)
**Surface:** Cloud › Connect › Sending keys › Revoke
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 10 — Revoke on `kanninja-backend (API pods)`: "Revoke kanninja-backend (API pods)? It was used 26s ago, so something still uses it. Apps that send with this key stop being recorded at once. To replace it with no gap, use Rotate instead." (Cloud › Connect › Sending keys)
**Blocked on:** —

## What Greta saw

Rotating keys, she pressed Revoke on `kanninja-backend (API pods)`, meaning the old frontend key. The question
read "Revoke kanninja-backend (API pods)? Apps that send with this key stop being recorded at once." The same
words show for a key nobody has used in months. The row said "Last used 49s ago", but the question did not, and
it did not say that Rotate would replace the key with no gap.

## Where it lives

`ui/src/pages/connect/KeysPanel.tsx` used one fixed sentence per key kind for the revoke question.

## Fix

`revokeText(k, now)`: a key used in the last day adds "It was used 49s ago, so something still uses it." and
"To replace it with no gap, use Rotate instead." Unused keys keep the short sentence.
