# 048 — The audit log says I revoked a key, but not which one

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · scoring (Audit log, after act 10)
**Surface:** Cloud › People & access › Audit log
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 10 the way she meant it — rotated `kanninja-frontend (web pods)`, put the new secret on the web app (used 40s later), then revoked the old secret (dialog: "It was used 2m ago, so something still uses it"): the Audit log reads "Revoked a key · kanninja-frontend (web pods) · ingest key" under "Rotated a key · kanninja-frontend (web pods)". The act 10 entry from before the fix stays unnamed: it never kept the name (Cloud › People & access › Audit log). cloud tests 219 pass
**Blocked on:** —

## What Greta saw

After act 10 the log read "Greta Lindqvist-Ochoa · Revoked a key" with nothing after it. The key she revoked by
mistake, `kanninja-backend (API pods)`, was the one thing the entry had to say. "Made a key" names its key only
while that key is still live, so after a revoke both entries go blank.

## Where it lives

`cloud/src/routes/keys.ts` audited `{ keyId }` only; `ui/src/pages/people/auditText.ts` names a key by looking
the id up in the live key list, and a revoked key is not in it. Bulk revoke kept only ids too. The email to the
team said "revoked the key <id>" for the same reason (`notify/team-describe.ts`).

## Fix

- Revoke keeps the key's name and kind; bulk revoke keeps every name; making a key keeps its name.
- The log shows the name it kept, so old entries stay readable after the key is gone; the team email uses it.
- `cloud.test.ts`: a revoked key's entry names it.

Entries written before the fix carry only the id, so they stay unnamed once their key is gone.
