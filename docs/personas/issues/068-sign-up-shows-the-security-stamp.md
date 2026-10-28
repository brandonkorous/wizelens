# 068 — A sign-up's SQL shows the new customer's SecurityStamp in clear

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 10
**Surface:** Trace detail › SQL (every stack)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 10 · Trace detail › SQL
**Blocked on:** —

## What happened

Zoë signed up (`p03.zoe@ashgrovepena.test`). The sign-up trace `06b4a6b3…` has the ASP.NET Identity
`INSERT INTO [AspNetUsers]`. Its params hide the email (`[redacted:email]`) and the password hash (`[redacted]`), but
`@p12`, bound to `[SecurityStamp]`, shows a 32-character value in clear.

## What should have happened

No security stamp in clear (act 10's "done when"). The SecurityStamp is what ASP.NET checks a sign-in cookie
against: with it in a shared dashboard, a reader holds a piece of the user's sign-in state.

## How to reproduce

1. Any ASP.NET Identity app with WizeLens. Register a user. Open the trace's SQL tab.

## Why it matters

Every ASP.NET Identity app writes this column on sign-up, password change, and sign-out-everywhere.

## Where it lives

The SQL param redaction (`core/src/redact-sql-params.ts` and its .NET, Go and Python copies) hides a value by its
column's name when it matches a redact key or `email`. `SecurityStamp` matches neither.

## The fix

`securitystamp` and `security_stamp` join `email` in the SQL param column keys in all four SDKs (TS
`SQL_PARAM_KEYS`, .NET `SqlParams.SqlParamKeys`, Go `SQLParamKeys`, Python `SQL_PARAM_KEYS`). Two shared cases in
`docs/redact-vectors.json` (an Identity INSERT and a snake_case UPDATE), run by the TS, .NET, Go and Python suites.
CONTRACT "SQL parameters" names them. Values stored before the fix stay as they were stored.

## Confirmed by

2026-10-27 19:40, P03 Zoë changed her password from My account → Change password (and back). Identity's
`UPDATE [AspNetUsers]` in trace `0d449743…` (SQL tab): `@p11` (SecurityStamp) reads `[redacted]`; the password hash
`[redacted]`, both emails `[redacted:email]`. The log line reads "User changed their password successfully."; no
password, hash or stamp in the page.
