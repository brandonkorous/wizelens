# 019 — An email inside a longer value reaches the agent

**Status:** fixed
**Severity:** major
**Found by:** P01 · kanNINJA web team · act 10
**Surface:** Every stored value (SQL parameters, attributes, log lines) → MCP `get_trace`, dashboards, exports
**Filed:** 2026-10-26
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P01 act 10 — kanNINJA refreshed, a new teammate (`p01.tomas.obriain@…`) signed up and reached "Check your email"; on the API dashboard (`localhost:3001/_wizelens`) the trace `POST /api/auth/*` (5e42e3dd…) shows `insert into "auth_verifications"` with params `["Boz…","[redacted:email]",…]` and the Logs tab `[email:dev] RESEND_API_KEY unset — not sending. to: [redacted:email]` (Dashboard · in-app › Trace › SQL and Logs). The `enduser.id` exception is proved by the shared vectors only: kanNINJA sends no `enduser.id`, so Users was empty (not checked on screen)
**Blocked on:** — (decided 2026-10-27: option B)

## What happened

Siobhán signed up to kanNINJA; an MCP agent read the trace (`get_trace 6cb9c75b…`). The #008 column rule hid every value
bound to an `email` column, the password hash and the session token. Two copies of her address were still there:

- `INSERT auth_verifications`: identifier `"email-verification-otp-p01.siobhan@kanninja.test"` (column `identifier`).
- A log line from kanNINJA's dev mailer: `to: p01.siobhan@kanninja.test`.

## What should have happened

Act 10's "done when": the agent's view has no password, session token, or raw email in SQL, headers or logs.

## Why it matters

A support agent or a hosted model reading traces gets customer addresses. The column rule cannot see an address that is
part of a longer value or a sentence, and those are common (log lines, cache keys, identifiers, error messages).

## Where it lives

`core/src/redact-values.ts` `VALUE_PATTERNS` (and its ports in .NET, Go and Python, run by `docs/redact-vectors.json`).

## The decision

An `[redacted:email]` value pattern would fix this everywhere at once, but it also hides addresses people use on purpose:
a user id that is an email (`enduser.id`, so the Users page groups them), a `from` header, a search for a customer's
address in Logs. Options: (A) mask in all text by default, with an opt-out; (B) mask in all text except `enduser.*`; (C)
keep it opt-in with a setting; (D) leave as is and document it.

## Also seen

- Dani's own sign-up (act 1, before #008) still shows the password hash, session token and email: redaction runs when a
  value is stored, so a fix does not clean data already kept (here for 1 day).
- The 6-digit code in the log line is kanNINJA's dev mailer printing it on purpose when `RESEND_API_KEY` is unset.

## The fix

Brandon chose B: hide email addresses in all text, except values of `enduser.*` keys.

- `core/src/redact-values.ts`: an `email` value pattern (`[redacted:email]`); `redactText` skips it for `enduser.*` keys.
  The kind is `ValueKind`, not `SecretKind`: the secret leak rule ignores it, as an email is personal data, not a leak.
- `dotnet/.../Storage/ValuePatterns.cs`: the same pattern and the same `enduser.*` exception (no local .NET: CI runs it).
- `docs/redact-vectors.json`: the two act-10 strings, a package spec with `@` versions that must stay, `enduser.id` kept,
  a `from` header hidden.
- `docs/CONTRACT.md` and `site/content/docs/security.md` name the marker and the exception.
- Search for a customer's address in Logs no longer finds it. That is the cost Brandon accepted with B.

## Confirmed by

## Rating effect
