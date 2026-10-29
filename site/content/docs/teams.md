---
title: Teams and access
description: Organizations, roles, project access, single sign-on, SCIM, shared links, and your own account in WizeLens Cloud.
---

## Teams and roles

Organizations hold projects. People join an organization with a role:

| Role | Can |
|---|---|
| Viewer | Read everything in the organization |
| Member | Also make alerts, tags, uptime checks, and share links |
| Admin | Also manage projects, keys, and members |
| Owner | Also manage owners, set the spend cap, and delete the organization. An organization always keeps one owner. |

People join with an invite link (7 days, one use). **Invite many** takes a pasted list of emails or a file (Excel, CSV,
or JSON, with an optional role per row) and gives you every invite link to download. Tick members to change their role
or remove them together. Run the cloud with `--signup open` to let anyone sign up; each new
person then gets their own organization. Org changes, member changes, keys, shares, and every MCP call go to the audit log.
Admins export the audit log as CSV or JSON (Business and Enterprise on the hosted cloud).

A member or viewer can have their own role on one project: more (up to admin of that project), less, or no access.
No access hides the project everywhere: the dashboard, trace links across projects, connected apps, and AI agents.
Owners and admins always keep their organization role. Set it in **People & access → Project access**.

The audit log pages back through all history and filters by action and by person. The export (CSV or JSON, on plans
with audit export) follows the same filters, and is itself in the log.

## Single sign-on and SCIM

Owners and admins connect OIDC (Okta, Entra ID, Google, Auth0, Keycloak) or SAML 2.0 under **People & access → Single sign-on**.
Sign-in works once you prove the email domain with a DNS TXT record; new people from that domain join as members, with a
confirmed email, and the sign-in page shows **Sign in with SSO**. Someone you remove (or who leaves) is not added back by
their next sign-in; invite them again to let them in. OIDC needs the provider's origin in `--sso-origins`, so
the cloud fetches from no other place. SAML needs none.

Tick **Require single sign-on** on a proven provider to make it the only way in for its domain. Everyone at the domain
except owners is signed out at once; after that a password, a passkey, a password reset, or a new password account is
refused for them. Owners keep their password and two-step sign-in, to get in when the provider is down. Someone who made a
password account before, and never confirmed its email, is linked on their first single sign-on, and that password ends.

With OpenID Connect, the cloud renews each person's single sign-on every 5 minutes. When the provider refuses (you turned
the person off, or their provider session ended), all their WizeLens sessions and their connected AI apps in your
organization end, and the audit log says so. A provider that does not answer signs nobody out. SAML has no renewal: use
SCIM, or remove the person under **People & access → Members**.

Under **People & access → User sync (SCIM)**, an admin makes a token and pastes it with the SCIM base URL
(`<public-url>/_wizelens/api/auth/scim/v2`) into Okta, Entra ID, or another identity provider. People it creates join as
members, and people it deactivates leave the organization (owners stay). Admins set roles in WizeLens. On the hosted
cloud, single sign-on and SCIM are on Business and Enterprise; a self-hosted cloud has both.

## Project settings

Each project can set its own slow query and N+1 thresholds, more redacted keys, and a shorter retention than its
organization. Thresholds and keys are under **Organization → Thresholds and hidden keys**, which has its own project
picker. Retention, for traces and logs of every project, is under **Organization → Data retention**, the one place it is
set. Owners, admins, and admins of the project change them. Thresholds and keys apply to data that arrives after you
save. A shorter retention deletes older data within minutes.

**Copy to other projects**, next to the project picker, copies one project's saved thresholds and hidden keys, and if
you tick it, its data retention, to every project you pick. It needs admin rights on each of them.

## All projects

Pick **All projects** in the project menu to see every project of the organization on one screen: requests, errors,
logs, services, search, alerts, SLOs, uptime checks, and saved views. With more than one organization, the same menu
picks the organization first.

- **Totals add up.** Charts and counts are the sum of your projects.
- **Same names stay apart.** Two projects with a service called `api` show it twice, as **api · Shop** and
  **api · Admin**. Open one and you see that project's service only.
- **Only what you may read.** A project hidden from you stays hidden, and nothing from another organization ever
  shows. Each row of data carries its organization, and the database itself refuses a read that does not name one.
- **Changes go to one project.** A new alert, SLO, or uptime check asks which project it belongs to. Settings, Apdex
  targets, status pages, and share links belong to one project: pick it in the menu, or from the list on the page.
- **Saved views** made under All projects belong to the whole organization and open there.
- **AI agents** that read more than one project read all of them together when a call names none.

## Traces across projects

Many front ends often share one API. Put each app in the project of the team that owns it: a trace that goes from a front
end in one project to the API in another still opens as one trace. The cloud adds the parts from the other projects you
may read, in the same organization only. A read key or a connected app gets only its own projects.

## Share links

A share link opens one trace, or one page as it was when you made the link, read-only, for anyone with the link, for 1 to
30 days. Use **Share** on a trace, or the link button in the top bar on a page. **Who is it for?** takes a name, a
client, or a ticket, so your team can tell links apart. See and revoke them under **People & access → Shared links**. Nothing else is reachable with it. It shows the parts of the trace its maker may read; after the maker leaves the organization, only the
shared project's part.

## Your account

**Account → Sign-in and security** has two-step sign-in with an authenticator app and 10 backup codes, and passkeys.
**Devices** lists where you are signed in, with sign-out per device. Breached passwords are refused (on Postgres), and
sign-in tries are limited per address.

**Account → Emails** sets digests per project (daily, weekly, or monthly, at your hour and time zone; weekly is on by
default), project health emails (a busy project went quiet for 2 hours, and when it is back), and, for owners and admins,
team change emails. Security emails are always on: password or email changed, two-step sign-in on or off, a passkey added
or removed, new backup codes, and a sign-in on a new browser. Team, health, and digest emails have a one-click stop link.
