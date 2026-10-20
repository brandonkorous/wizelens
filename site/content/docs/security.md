---
title: Security
description: The security risks WizeLens finds in real traffic, mapped to the OWASP Top 10, and how each one is found.
---

WizeLens sees every request, query, outgoing call, header, and log line your app really serves. The **Security** page
uses that to find the risks that slip past pull requests and tests, and maps each one to the
[OWASP Top 10:2025](https://owasp.org/Top10/). Each risk shows its evidence, the endpoints and users it touched, how to fix
it, and an example trace. Pick a service and a release to see what is **new in that release**.

A finding is a strong hint from real traffic, not proof. Open the example trace to check it. WizeLens never stores a
secret to report it: a risk names what was found and where, never the value.

The same rules run in .NET and in Node, on the same shared test cases, so every service gives the same answer. Risks
also show on each trace (the **Security risks** list above the tabs), in Ctrl+K, and through the MCP tool
`find_security_issues`.

## The rules

| OWASP | Risk | What WizeLens sees |
|---|---|---|
| A01 Broken Access Control | Open admin route | A route with an `admin`, `internal`, or `management` segment answered 2xx with no user, no `Authorization`, no cookie, and no API key |
| A01 Broken Access Control | SSRF | An outgoing call's host or URL came from a value in the request |
| A02 Security Misconfiguration | Missing headers | A 2xx answer without `X-Content-Type-Options`; HTML without a CSP or framing rule; HTTPS without HSTS |
| A02 Security Misconfiguration | Version header | `X-Powered-By`, `X-AspNet-Version`, or `Server` with a version number |
| A02 Security Misconfiguration | Loose CORS | Any origin allowed with credentials, or the `null` origin allowed |
| A02 Security Misconfiguration | Exposed path | `/.env`, `/.git/`, `/actuator/env`, `/debug/pprof`, `server-status`, and similar answered 2xx |
| A03 Software Supply Chain Failures | Vulnerable package | A package a service runs has a published advisory ([OSV](https://osv.dev)) |
| A04 Cryptographic Failures | Cookie flags | A cookie without `Secure` over HTTPS or with `SameSite=None`, or a session cookie without `HttpOnly` |
| A04 Cryptographic Failures | Plain HTTP | An outgoing call to a public host over `http://` |
| A04 Cryptographic Failures | Secret in URL | A `token`, `password`, `apikey`, or other secret key in a URL query |
| A05 Injection | SQL injection | A value from the request appears as a literal inside the SQL text |
| A07 Authentication Failures | Sign-in guessing | 10 or more failed sign-ins (401, 403) from one address on one endpoint; it says so when no 429 was seen |
| A09 Security Logging and Alerting Failures | Secret leak | A JWT, cloud or API key, private key, or card number in logs, span data, or an answer |
| A10 Mishandling of Exceptional Conditions | Stack trace | A 4xx or 5xx answer whose body holds a stack trace |

A06 Insecure Design and A08 Integrity Failures need a design review, not traffic, so WizeLens does not guess at them.

## What the rules need

- **Headers.** The Node and .NET add-ons capture request and response headers. The Java SDK captures the security headers
  by name, and the Go SDK captures both sides. Rules that read headers skip a request whose headers were not captured.
- **SQL text with values.** The SQL rule compares request values with the literals in the SQL text. Parameterized queries
  have no literals, which is the point. The plain OpenTelemetry agents replace literals with `?`, so they never show it.
- **Bodies.** Stack traces in answers need response body capture (`captureResponseBody`, `CaptureResponseBody`, or
  `WIZELENS_CAPTURE_BODY=true`). JSON request bodies count as request values when they are captured.

## Secrets stay hidden

Before anything is stored, WizeLens replaces secrets found inside any value with a typed marker: `[redacted:jwt]`,
`[redacted:aws-key]`, `[redacted:private-key]`, `[redacted:stripe-key]`, `[redacted:github-token]`,
`[redacted:slack-token]`, `[redacted:google-key]`, and `[redacted:card]`. The **secret leak** rule reads the markers. A
`Set-Cookie` header keeps each cookie's name and flags (`sid=[redacted]; Path=/; Secure; HttpOnly`), and URL queries keep
their keys (`token=[redacted]`), so the cookie and URL rules still work.

## Known-vulnerable packages

Every SDK sends the names and versions of the packages it runs once at start: npm, NuGet, PyPI, Maven, and Go modules.
The hub and the cloud check them against [OSV](https://osv.dev) every few minutes (each version once a day) and list each
version with advisories, its CVEs, and the version that fixes it. Only package names and versions leave your machine.

Turn it off in an app with `WIZELENS_PACKAGES=false`, or on the hub with `--no-osv` (`WIZELENS_HUB_OSV=0`).

## Alerts

The alert metric **New security risks** fires when a risk shows up that the window before did not have. Pick a service to
watch one.
