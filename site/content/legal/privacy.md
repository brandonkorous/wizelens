---
title: Privacy
description: What this site collects (nothing), what the WizeLens software sends, what WizeLens Cloud at app.wizelens.com keeps, and the choices you have.
updated: October 28, 2026
---

This policy covers the website at wizelens.com, the WizeLens software, and WizeLens Cloud at app.wizelens.com. It is written
by WizeWorks LLC, Visalia, California ("we"). The short version: this site does not track you, the software does not send us
your data, and the hosted cloud keeps only what it needs to run your account and show you your telemetry.

## This website

- **No cookies.** This site sets no cookies.
- **No analytics or tracking.** We do not use analytics, ad pixels, or tracking scripts.
- **No third-party requests.** Fonts and images are served from this site. Your browser does not contact other companies when you read it.
- **Server logs.** Our servers may keep standard request logs, such as IP address, browser type, and the page asked for, for
  a short time to keep the site running and safe. We do not use these logs to identify you.

## The WizeLens software

The WizeLens add-ons and the local hub run on computers you control. WizeLens Cloud runs on yours, or on ours at
app.wizelens.com.

- **Your data stays with you.** When you self-host, traces, logs, metrics, and errors are stored on your own machines, in your
  own hub, or in your own cloud database. They are never sent to WizeWorks.
- **No telemetry.** The software does not send usage data, crash reports, or anything else to us. Emails from a WizeLens Cloud
  load the WizeLens mark from wizelens.com.
- **You decide where data goes.** Data leaves an app only for the hub or the cloud you point it at with `WIZELENS_HUB`. The
  Java, Python, and Go SDKs send to a hub on the same machine (`localhost:5960`) until you set it.
- **Package checks.** The hub and the cloud check the names and versions of your packages with OSV (osv.dev). Nothing else is
  sent. `--no-osv` on the hub or cloud, or `WIZELENS_PACKAGES=false` in an app, turns it off.
- **Secrets are redacted.** Before anything is stored, values for keys such as `authorization`, `cookie`, `password`, `token`,
  `secret`, `apikey`, and `connectionstring` become `[redacted]`. URL queries keep their keys (`token=[redacted]`), cookies
  keep their names and flags, and JWTs, cloud and API keys, private keys, and card numbers inside any value or log line become
  a typed marker such as `[redacted:jwt]`.

If you self-host WizeLens Cloud for your team, you are responsible for the data in it and for telling your team how it is used.

## WizeLens Cloud at app.wizelens.com

- **Who runs it and where.** We run it on Microsoft Azure in the United States (the Central US region).
- **Account data.** Your name, email, a hashed password, your two-step sign-in settings and passkeys, and each signed-in
  device's IP address and browser. We use the device data for your list of signed-in devices and for new sign-in emails.
- **Your telemetry.** The traces, logs, and metrics your apps send. They can hold data about your own users, such as user ids.
  We keep them for your project's retention, which your plan caps: Free 14 days, Team 30, Business 90, Enterprise up to 400.
  Telemetry is backed up nightly to Azure storage, and those backups expire after 14 days.
- **Who can see it.** You, and the people and apps you let in. Each organization reads only its own data.
- **Billing.** Stripe runs checkout, the customer portal, invoices, and the usage meter. We never see your card number.
- **Email.** Resend sends our email, from updates.wizelens.com.
- **Breached-password check.** When you set a password, the first 5 characters of its hash go to Have I Been Pwned, so a known
  breached password is refused. The password itself never leaves the cloud.
- **Connected apps.** An AI app that signs in with OAuth reads only the projects you pick, until you remove it under
  Account → My apps. The audit log records every call it makes.
- **The audit log.** Changes to your organization, and who made them, are kept in its audit log.
- **Deleting.** You can delete your account. An owner can delete an organization, which deletes its projects, their
  telemetry, and its audit log.

## Who else handles data

For WizeLens Cloud at app.wizelens.com, these services handle data for us: Microsoft Azure (hosting, Central US), Stripe
(billing), Resend (email), OSV (package names and versions), and Have I Been Pwned (password hash prefixes).

## When you contact us

If you email us, we keep your message and address so we can answer you. We do not add you to a mailing list.

## GitHub

The source code and issues live on GitHub. When you use GitHub, GitHub's own privacy policy applies.

## Selling or sharing data

We do not sell personal information. We share it only with the services listed above, and only to run the cloud for you.

## Your rights

You can ask what personal information we hold about you, ask us to correct it, or ask us to delete it. California residents
have these rights under the California Consumer Privacy Act, and we give them to everyone. We will not treat you differently
for asking. Email [privacy@wizelens.com](mailto:privacy@wizelens.com).

## Children

This site and the software are made for software developers. They are not directed at children under 13, and we do not
knowingly collect information from them.

## Changes

If this policy changes, we will update it here and change the date at the top.

## Contact

WizeWorks LLC, Visalia, California. [privacy@wizelens.com](mailto:privacy@wizelens.com)
