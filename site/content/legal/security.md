---
title: Security
description: How to report a security problem in WizeLens, what WizeLens finds in your app, and how the software and WizeLens Cloud keep your data safe.
updated: October 21, 2026
---

## Report a problem

If you find a security problem in WizeLens or on this site, please email
[security@wizelens.com](mailto:security@wizelens.com). Please do not open a public GitHub issue for it.

Tell us:

- what you found, and which package and version it is in;
- the steps to see it happen;
- what someone could do with it.

We will confirm we got your report, keep you updated while we fix it, and credit you when the fix ships, if you want credit.

## Good-faith research

If you look for problems in good faith, follow this page, and give us a fair chance to fix them before you tell anyone,
we will not take legal action against you. Please test only against your own installs. Do not touch other people's data,
and do not disrupt anyone's service.

## What WizeLens finds in your app

The Security page finds risks in the traffic your app really serves: SQL built from input, missing security headers, loose
CORS, insecure cookies, secrets in URLs and logs, SSRF, open admin and debug routes, and bursts of failed sign-ins. It maps
each one to the OWASP Top 10:2025. It never stores a secret to report it. Known-vulnerable packages are checked against OSV
with names and versions only. See [Security](/docs/security/) in the docs.

## How the software keeps data safe

- **Send-only in production.** The .NET and Node add-ons serve their dashboard, read API, and MCP in development only. Outside
  development they are send-only: they capture and send to your hub or cloud, and every other path under `/_wizelens` is a
  404, unless you turn the dashboard on. The Java, Python, Go, and browser SDKs only send.
- **Redaction.** Before anything is stored, values for keys such as `authorization`, `cookie`, `password`, `token`, `secret`,
  `apikey`, and `connectionstring` become `[redacted]`. URL queries keep their keys (`token=[redacted]`), cookies keep their
  names and flags, and JWTs, cloud and API keys, private keys, and card numbers inside any value or log line become a typed
  marker such as `[redacted:jwt]` (the same cases in every SDK: `docs/redact-vectors.json`).
- **Local by default.** The hub listens on 127.0.0.1. `--host 0.0.0.0` opens it to the network; add `--token` so every call
  needs it (the hub warns when you don't).
- **Read-only AI access.** The MCP endpoint on the add-ons and the hub is off by default. It cannot change anything, and it
  logs every call. In the cloud, an AI app signs in with OAuth 2.1 (PKCE, one-hour access tokens that renew) and reads only
  the projects its person picked, until removed under Connected apps.
- **Outbound calls.** Alert webhooks and uptime checks cannot reach private or local addresses unless you allow it.

## How WizeLens Cloud keeps data safe

- **Keys.** Only a hash of each ingest key, read key, share link, status link, and SCIM token is stored; the secret is shown
  once. Keys can expire, keep to scopes, and rotate.
- **Sign-in.** Passwords are 12 to 128 characters, and breached ones are refused. Sign-in tries are limited. Sessions are
  checked in the database on every request, so a sign-out or a removed member takes effect at once.
- **Two-step sign-in and passkeys.** Codes from an authenticator app, with 10 backup codes. Passkeys require the person on the
  device, by PIN or fingerprint.
- **Single sign-on and SCIM.** SAML 2.0 or OIDC per organization, once its email domain is proven with a DNS record. SCIM
  adds and removes people from your identity provider.
- **Sessions.** The sign-in cookie is HttpOnly, and secure on https. Every change from a browser needs a header another site
  cannot send.
- **Each organization sees only its own data.** Reads run under Postgres row-level security, keyed to the organization.
- **Encrypted secrets.** Two-step sign-in secrets, backup codes, and uptime-check header values are stored encrypted with the
  cloud's auth secret. Traffic to app.wizelens.com uses TLS.
- **Audit log.** Every change to an organization and every MCP call is in its audit log. Business and Enterprise can export it.

## Where WizeLens Cloud runs

WizeLens Cloud at app.wizelens.com runs on Microsoft Azure in the United States (the Central US region). Stripe handles
billing, Resend sends email, OSV checks package names and versions, and Have I Been Pwned checks password hash prefixes. See
[Privacy](/privacy/#wizelens-cloud-at-appwizelenscom) for what each one gets.

## Supported versions

Fixes go into the newest release. Every release is in the [changelog](/changelog/).

## Machine-readable contact

Our contact details are also at [/.well-known/security.txt](/.well-known/security.txt).
