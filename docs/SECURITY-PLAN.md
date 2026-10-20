# WizeLens — Security Plan

Written 2026-10-20. WizeLens sees every real request, query, outgoing call, header, and log line. Code scanners read code,
and a pen test runs once. WizeLens can find the security risks that slip past pull requests and tests, from the traffic the
app really serves, and say which release brought each one in.

The rules map to the **OWASP Top 10:2025**. Each finding is a hint with evidence (the trace that shows it), not proof. The
pages say so. WizeLens never stores a secret to report it: the finding names what was found and where, never the value.

The rules of `GAPS-PLAN.md` ("Rules for every phase") still hold. One commit per phase, one pull request at the end.

## Status

| Phase | What | Size | State |
|---|---|---|---|
| 1 | Redaction that keeps the evidence | M | Done |
| 2 | Trace rules (JS) and the trace view | L | Done |
| 3 | Trace rules in .NET, shared vectors, .NET MCP tool | M | Done |
| 4 | Rollups and the `security` page model | L | Done |
| 5 | The Security page | L | Done |
| 6 | MCP tool, alerts, and search hits | M | Done |
| 7 | SDKs report their packages | M | Done |
| 8 | Known-vulnerable packages (OSV) on hub and cloud | L | Done |
| 9 | Docs, site, and changelog | S | Done |

## OWASP Top 10:2025 and the rules

| OWASP | Rule (`kind`) | What WizeLens sees | Severity |
|---|---|---|---|
| A01 Broken Access Control | `open-admin` | An admin route answers 2xx with no user, no `authorization`, no `cookie`, and no API key header | warning |
| A01 Broken Access Control | `ssrf` | An outgoing call's host or URL comes from a request input value | error |
| A02 Security Misconfiguration | `missing-headers` | A 2xx answer without `x-content-type-options`; HTML without CSP or framing rules; HTTPS without HSTS | warning |
| A02 Security Misconfiguration | `version-header` | `server` with a version number, `x-powered-by`, `x-aspnet-version`, `x-aspnetmvc-version` | info |
| A02 Security Misconfiguration | `cors` | `access-control-allow-origin: *` with credentials, or the `null` origin allowed | warning |
| A02 Security Misconfiguration | `exposed-path` | `/.env`, `/.git/`, `/actuator/env`, `/debug/pprof`, `/server-status`... answers 2xx | error |
| A03 Software Supply Chain Failures | `vulnerable-package` | A package the service runs has a known vulnerability (OSV) | by advisory |
| A04 Cryptographic Failures | `cookie-flags` | A cookie set without `Secure` on HTTPS, `SameSite=None` without `Secure`, or a session cookie without `HttpOnly` | warning |
| A04 Cryptographic Failures | `plain-http` | An outgoing call over `http://` to a public host | warning |
| A04 Cryptographic Failures | `secret-in-url` | A sensitive key (`token`, `password`, `apikey`...) in a URL query | warning |
| A05 Injection | `sql-injection` | A request input value appears as a literal inside the SQL text | error |
| A07 Authentication Failures | `auth-guessing` | 10 or more failed sign-ins (401, 403) from one address on one endpoint; worse with no 429 | warning |
| A09 Security Logging and Alerting Failures | `secret-leak` | A JWT, cloud key, private key, or card number in logs, span data, or a response | error |
| A10 Mishandling of Exceptional Conditions | `stack-exposed` | A 4xx or 5xx answer whose body holds a stack trace | warning |

Left out, on purpose: A06 Insecure Design and A08 Integrity Failures need design review, not traffic. An IDOR rule (one user
reads many ids) is not a signal: normal use reads many ids. The exact rules are in `CONTRACT.md` ("Security analysis").

## Phase 1 — Redaction that keeps the evidence

Today `set-cookie` is redacted whole, so the cookie flags are lost. Secrets inside values (a JWT in a log line) are kept.
Query strings are raw from Node, the browser, Python, Java, and Go (also `GAPS-PLAN-2.md` phase 21, item 3).

1. **Cookies keep their flags.** A `set-cookie` value becomes `sid=[redacted]; Path=/; Secure; HttpOnly`. Core
   (`redactAttributes`), .NET `Redactor`. Python stops OpenTelemetry's own header sanitizer from blanking `set-cookie`
   (the hub redacts it). Java and Go send raw to the hub, which redacts.
2. **Query values by key.** `url.query` and `url.full` keep their keys and lose sensitive values: `token=[redacted]`.
   Core does it at store and ingest, so Node, the browser, Python, Java, and Go are covered at the hub and cloud.
3. **Values by pattern.** Every string value (attributes, event attributes, log messages and attributes, bodies) has
   these replaced with a typed marker: `[redacted:jwt]`, `[redacted:aws-key]`, `[redacted:private-key]`,
   `[redacted:stripe-key]`, `[redacted:github-token]`, `[redacted:slack-token]`, `[redacted:google-key]`,
   `[redacted:card]` (13 to 19 digits that pass the Luhn check). The marker is the evidence the `secret-leak` rule reads.
   This is the first half of `GAPS-PLAN-2.md` phase 27 ("redact by value"); emails come with phase 27.
4. **Shared vectors.** `docs/redact-vectors.json`, run by the TS and .NET tests.

## Phase 2 — Trace rules (JS) and the trace view

- `core/src/security/`: one file per area (inputs, sql, headers, cookies, calls, paths, leaks), `findSecurity(trace)`,
  and `OWASP` names. `analyzeTrace` adds them. `insightsOf` leaves them out, so request health, "Insights Found",
  and the Insights page do not change. `securityOf(findings)` picks them.
- Request inputs: query values, path values (from `http.route` against `url.path`), and JSON body values when captured.
- `docs/security-vectors.json`: traces and the findings they must give.
- The trace view lists security findings with their own labels, and a Security tab.

## Phase 3 — Trace rules in .NET

- `Analysis/Security*.cs` with the same rules. The .NET tests run `security-vectors.json` and `redact-vectors.json`.
- The .NET MCP tool `find_security_issues`.

## Phase 4 — Rollups and the `security` page model

- Kinds `sec` (key `kind|shape`, newest top), `sec.ep`, `sec.u`, per service `sec@svc` and `sec.ep@svc`, and
  `sec.auth` (`service|endpoint|address`: requests, failures, 429s) for `auth-guessing`. `FACTS_VERSION` goes up.
- `security` page model: totals (open, high, endpoints), the 10 OWASP categories with counts, groups, filters
  (`service`, `status`, `release`, `category`, `severity`, `endpoint`, `q`), `key` for one group with its users.
- Issue states as insights (resolve, dismiss, regressed). The scenario gets traces that set off every rule, and the
  parity tests run the page on memory, SQLite, Postgres, and ClickHouse.

## Phase 5 — The Security page

- `#/security` in the sidebar. Stat cards, the OWASP grid (a click filters), filters, the list, and a detail panel with
  the evidence, how to fix it, endpoints, users, the example trace, and issue actions. CSV export. "New in 1.4.2" with
  the release filter.

## Phase 6 — MCP tool, alerts, and search hits

- MCP `find_security_issues` (in-app, hub, cloud): from the `security` page when the host has stats, else from traces.
  `get_page` takes `security`.
- Alert metric `new_security_risks`: risks in the window that were not in the one before.
- Ctrl+K lists security risks.

## Phase 7 — SDKs report their packages

- Each SDK sends its packages once at start: `{ ecosystem, name, version }[]` on the service registration.
  Node (`node_modules`, npm), .NET (`deps.json`, NuGet), Python (`importlib.metadata`, PyPI), Java (`pom.properties`
  in jars, Maven), Go (`debug.ReadBuildInfo`, Go).

## Phase 8 — Known-vulnerable packages

- Hub and cloud keep packages per service and version, ask OSV (`api.osv.dev/v1/querybatch`, then `v1/vulns/{id}`)
  when a new set arrives and once a day, and cache the advisories. Only package names and versions leave the host.
  The hub has `--no-osv`.
- `vulnerable-package` findings on the Security page (A03) with the fixed version. Capability `packages`.

## Phase 9 — Docs, site, and changelog

- `GETTING-STARTED.md`, the site's docs and features, and `CHANGELOG.md`.
