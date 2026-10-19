---
title: Security
description: How to report a security problem in WizeLens, and how the software keeps your data safe.
updated: October 17, 2026
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

## How WizeLens keeps data safe

- **Off in production.** The add-ons are on in development only, unless you turn them on.
- **Redaction.** Values for keys such as `authorization`, `cookie`, `password`, `token`, `secret`, and `connectionstring` are
  replaced with `[redacted]` before they are stored.
- **Local by default.** The hub listens on this machine only, unless you start it with `--host` and a `--token`.
- **Read-only AI access.** The MCP endpoint is off by default, cannot change anything, and logs every call. In the cloud,
  an AI app signs in with OAuth (PKCE, a one-hour token) and reads only the projects its person picked, until removed.
- **Keys in the cloud.** Only a hash of each ingest and read key is stored. The secret is shown once.
- **Sessions in the cloud.** The sign-in cookie is HttpOnly and secure on https. Every change from a browser needs a header
  another site cannot send.
- **Webhooks.** Alert webhooks cannot reach private network addresses unless you allow it.

## Supported versions

WizeLens is in alpha. Fixes go into the newest release only.

## Machine-readable contact

Our contact details are also at [/.well-known/security.txt](/.well-known/security.txt).
