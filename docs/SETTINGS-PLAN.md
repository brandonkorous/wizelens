# WizeLens — Settings Plan

Decided 2026-10-22. The Team and Settings pages were hard to use: "Team" held billing, single sign-on, and deleting the
organization; a project was set up on two pages; data retention was set in three places; connecting a service sent you
from Settings to Team and back; and Settings mixed your own look, server setup, and a docs table. We compared three
layouts in a clickable mock-up and picked **pages by task**.

## Status (2026-10-22)

| Step | State |
|---|---|
| 1. Connect page: setup steps, server setup, sending keys, AI read keys, add-on options | Planned |
| 2. People & access page: members, project access, single sign-on, user sync, connected apps, shared links, audit log | Planned |
| 3. Organization page (Settings on a hub or in-app): projects, data retention, thresholds, tags, billing, general, preferences | Planned |
| 4. Menus and links: sidebar, user menu, new organization in the switcher, old links redirect, Team and Settings pages go | Planned |
| 5. Cloud links in emails and Stripe, docs, and the changelog | Planned |

## The pages

Each page is one task. Its sections are its URLs (`#/<page>/<section>`), as before.

| Page | Shows on | Sections |
|---|---|---|
| **Connect** (`#/connect`) | Every host | Setup steps · Server setup (This service in-app) · Sending keys (cloud) · AI read keys (cloud) · Add-on options |
| **People & access** (`#/people`) | Cloud | Members · Project access · Single sign-on · User sync (SCIM) · Connected apps · Shared links · Audit log |
| **Organization** (`#/organization`) | Cloud | Projects · Data retention · Thresholds and hidden keys · Tags · Billing · General |
| **Settings** (`#/settings`) | Hub, in-app | Data retention · Thresholds and hidden keys · Tags · Preferences |
| **Account** (user menu) | Cloud | Profile · Sign-in and security · Devices · My apps · Emails · Preferences · Delete account |

Rules:

- **Your own things are in Account.** Theme, time range, time zone, and clock move from Settings to Account,
  Preferences. A hub has no sign-in, so there they stay on its Settings page.
- **Data retention has one place.** Organization, Data retention holds the longest any project keeps data (the
  organization's retention, capped by the plan) and, per project, how long traces and logs are kept. The project
  table and the General section no longer set it.
- **Project settings name their project.** Data retention lists every project. Thresholds and hidden keys has its own
  project picker, so it no longer depends on the project chosen in the top bar.
- **Keys sit where they are used.** Sending keys (ingest and browser) are made inside Connect, next to the setup steps.
  AI read keys sit beside them. The "API keys" list that mixed both kinds goes.
- **Two lists of connected apps get two names.** Account has "My apps"; People & access has "Connected apps".
- **A new organization is made from the organization switcher** in the top bar, not from inside the current one.
- **Plain names.** "SCIM" becomes "User sync (SCIM)", "This cloud" becomes "Server setup", "Dashboard" becomes
  "Preferences".

## Old links

Emails, bookmarks, and Stripe still hold `#/team/...` and `#/settings/...`. They open the new place:

| Old | New |
|---|---|
| `#/team`, `#/team/people` | `#/people/members` |
| `#/team/projects`, `#/team/billing`, `#/team/organization` | `#/organization/projects`, `/billing`, `/general` |
| `#/team/keys` | `#/connect/keys` |
| `#/team/apps`, `/sso`, `/scim`, `/links`, `/audit` | `#/people/...` with the same section |
| `#/settings/dashboard` | `#/account/preferences` (cloud), `#/settings/preferences` (hub, in-app) |
| `#/settings/project` | `#/organization/checks` (cloud), `#/settings/checks` |
| `#/settings/connect`, `/services`, `/options` | `#/connect/setup`, `/server`, `/options` |
| `#/settings/tags` on the cloud | `#/organization/tags` |

The query (`?org=`, `?project=`) is kept, so a link still opens the right organization.
