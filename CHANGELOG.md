# Changelog

All notable changes to WizeLens. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Saved views and searches.** The star in the top bar saves the page you are on, with its filters and time range. Saved
  views show under Saved in the sidebar; saved searches also show under the Search box. On the cloud they are yours until
  you share them with the team.
- **Dashboards:** your own pages of metric charts. A chart shows one to six metrics, filtered by any attribute value and
  split by any attribute, as lines, areas, stacked bars, numbers, or a table. The Metrics page API takes the same filter.
- **CSV export** on Errors, Logs, Database, Traces, Insights, and Search, next to Requests.
- **Share a page** (cloud): a read-only link to a page as it is now, its numbers kept for 1 to 30 days. Not only traces.
- **SLOs and error budgets.** An SLO says how much of a service's or an endpoint's traffic must succeed, or be fast enough,
  over 7 or 30 days. The SLOs page shows how much error budget is left and how fast it burns over the last hour and 6 hours;
  each SLO has a page with its budget and good share over time. **Alert on burn rate** makes an alert rule that watches it.
- **Apdex** on the Overview and each service page, against a target time per service (500 ms unless you set one on the SLOs
  page).
- **Alerts on the hub,** not only the cloud. Rules can watch one service or one endpoint, and use **at or above** and
  **at or below**. **Remind** while a rule keeps firing, **acknowledge** to stop the reminders, **mute** for an hour, a day, or
  until unmuted, and turn rules **on or off** from the list. Rules send to up to five channels, all editable: Slack,
  **Microsoft Teams**, **Discord**, **PagerDuty**, webhooks, and email (cloud). Each rule has its own page: its value against
  the line over time, every notice and change, and a link to the traces behind it. **Alert on this** opens a new rule from a
  service, an endpoint, an error, or a metric chart.
- **Releases.** Add-ons send the app's version (`release`, or `WIZELENS_RELEASE`; .NET reads the entry assembly's
  version, Node reads `npm_package_version`, React takes a `release` prop, and OpenTelemetry apps send `service.version`).
  Every chart marks the time a new version first sent data. The service page compares its newest versions: requests, error
  rate, p95, and the error groups each one brought. Errors and Insights get a **New in this release** filter.
- **Error tracker workflow.** Resolve an error group, or ignore it for an hour, a day, a week, or for good. A resolved
  group that happens again shows as **Regressed** and comes back to the list. The Errors page lists unresolved groups by
  default, with a Status filter and a **New only** filter. "First seen" is now the first time over all kept data, not the
  start of the range. On the cloud, a group can be **assigned** to a member, and each change writes an audit line.
  Insights get the same: **Mark fixed** and **Dismiss**. The Overview has a "New and Regressed Errors" panel. The hub
  and the cloud keep these states; in-app add-ons show no actions.
- **A page for each error, endpoint, query, and page route.** An error shows its count over time, its endpoints, the users
  and browsers of its newest occurrences, the stack, and those occurrences. An endpoint shows requests, errors, and
  p50/p95/p99 over time, the queries it runs, what it calls, its errors, and its slowest requests. A query shows its runs
  and time over time, the services and endpoints that run it, and its newest traces. A route shows views and load times
  over time, its components, and its newest page loads. Lists across the app open these pages.
- **A better trace page:** find spans by name or service, errors only, the critical path, expand or collapse all, self time
  on each span, links from a span to its service, endpoint, query, error, and the request's logs, attribute values that
  search, a JSON download, and **Compare** with another trace (numbers, self time per service, and both waterfalls).
- **Dependency map:** each link shows p95 and the share that failed, and opens the service it calls.
- **Number cards link** to the list behind them (for example Error Rate opens the failed requests).

- **Links keep the view.** The time range, a custom window, the compare choice, environment, project, and service are in
  the address bar, so a copied link (or an alert notice) opens exactly what you saw.
- **Custom time range and zoom.** Pick any from–to in the range menu, or drag across a chart to zoom into that span.
- **Compare with last week.** The range menu can compare numbers with the same time last week instead of the period
  before. The Overview activity, Errors over time, and a service's traffic chart draw the compared period as a dashed line.
- **Time zone and clock.** Settings can show times in UTC and on a 24-hour clock.
- **Live or paused** on Logs and Requests: pause to keep the list still while new data comes in.
- **A pricing page at wizelens.com/pricing.** The four cloud plans (Free, Team $29, Business $99, Enterprise), the
  steps for extra data, yearly billing at 12 months for the price of 10, a slider that prices your monthly GB on every
  plan as you move it, what self-hosting costs (nothing), a year-one cost comparison with Datadog and Dynatrace for a
  40-developer company with its sources, and pricing questions. Linked from the top bar, the footer, and the Cloud page.
  The cloud docs have a new "Plans and billing" section: what a GB is, the Free cap's HTTP 429, the spend cap, history
  per plan, and that billing is off when you self-host.
- **Install with no code change.** Platform teams can turn WizeLens on without touching a service:
  - **Node:** `NODE_OPTIONS="--import @wizeworks/lens-node/auto"`. It traces every `node:http` server, names Express,
    Fastify, Koa, Hono, and Next.js routes, records their errors, and hooks `pg`, `mysql2`, `better-sqlite3`,
    `node:sqlite`, Prisma Client, gRPC, amqplib, kafkajs, Service Bus, pino, winston, and bunyan as the app loads them.
    Set by variables only: `OTEL_SERVICE_NAME` (else the `package.json` name), `WIZELENS_HUB`, `WIZELENS_ENABLED`, and the
    rest. `WIZELENS_AUTO_SKIP` leaves hooks off.
  - **.NET:** the new `WizeLens.AutoInstrumentation` package is a startup hook
    (`DOTNET_STARTUP_HOOKS=.../WizeLens.AutoInstrumentation.dll`) and hosting startup that does what `AddWizeLens()` and
    `UseWizeLens()` do, and also records EF Core commands and the exceptions an exception page catches. Each release has
    the hook folder as `wizelens-dotnet-auto-<version>.zip`.
  - **Kubernetes:** a mutating webhook (Helm chart `oci://ghcr.io/brandonkorous/charts/wizelens-inject`, image
    `ghcr.io/brandonkorous/wizelens-inject`) adds the hook and the variables to pods labeled
    `wizelens.dev/inject: node` or `dotnet`.
  - The code install stays and wins: when the app calls `createWizeLens()` or `AddWizeLens()` too, the auto install steps
    aside and nothing is counted twice. `UseWizeLens()` now adds its middleware once, however often it is called.
  - New samples with no WizeLens code: `samples/auto-node` and `samples/auto-dotnet`.

- **Connect Claude to WizeLens Cloud with a sign-in, not a key.** Add `https://mcp.wizelens.com` to Claude (Settings →
  Connectors), Claude Code, Cursor, or any MCP client. It opens the WizeLens sign-in, and you pick one organization and
  either all its projects (also later ones) or only some. The app gets read-only access that renews on its own, so a
  scheduled task keeps working, until you remove it under **Account → Connected apps**. Admins see and remove everyone's
  apps under **Team → Connected apps**, and leaving the organization ends access at once. The audit log shows who
  connected which app and every call it made. This is OAuth 2.1 with PKCE and dynamic client registration through Better
  Auth's OAuth provider. Read keys stay, for scripts and CI. Self-hosted: it works at `<public-url>/_wizelens/mcp`, and
  `--mcp-url` (`WIZELENS_CLOUD_MCP_URL`) gives MCP its own name behind your proxy.
- **`get_overview`, a health report for agents** (hub and cloud). Requests, error rate, and duration against the window
  before; every service's status, traffic, errors, and p95; the top errors; and the biggest insights. In the cloud, called
  without a project it reports on every project you may read, the ones that need attention first: one call for a morning
  report on 20 APIs.
- **Filter every page by service.** Pick a service in the top bar menu (or any page's Service filter) and every page
  counts that service only: Overview, Requests, Traces, Database, Errors, Logs, Insights, and Metrics. A chip in the top
  bar clears it. Links that name a service still win.
- **Errors:** filter by type, endpoint, critical, and text; order by newest or most frequent; page through every group
  (the list stopped at the newest 200). Error types and services can be clicked to filter.
- **Database:** filter by database, operation, table, and text; order by slowest, most frequent, or total time; page through
  every query. New columns: max, total time, slow, and errors. Endpoints link to their requests; operation bars and table
  rows filter the list.
- **Traces:** filter by status and duration, order by newest or slowest, and page; the timeline shows the first listed trace.
- **Logs:** "this level only", a category filter (click a category), a trace filter, and rows that open to show attributes.
- **Requests:** exact endpoint and user filters (as chips), "with insights", and DB time and errors columns to sort by.
  Links from errors, insights, the Database page, and the service page use the exact endpoint, not a text search.
- **Rendering:** search routes and components; LCP and large images columns.

### Changed

- Stats are rebuilt once after this update (`FACTS_VERSION` 4), so each count can be read per service and per endpoint.

### Fixed

- **A link to an error opens that error.** The Errors page showed the first listed error when the linked one was not
  among the newest 200 (links from the service page do that). It now loads the linked group by key, or says it is not
  in the time range.
- **The trace page uses your app's thresholds** for slow queries and N+1, like the Insights page. It used 100 ms and 5.
- **Cut lists say so.** Errors, Database, Rendering, and Traces titles show "200 of 1,240" when a list holds only part.
  "Top Slow Queries" is now "Slowest Queries".
- **Links keep their place.** Database insight cards open the insight. "View affected requests" shows failed requests.
  The Traces "View all" keeps the search. "View all" on Critical Spans shows only when there are more.
- **Alert notice links open the right project**, and the Alerts page says when a host does not run alerts.
- **An unknown status or duration in a Requests link filters nothing**, the same as an empty one (status matched
  nothing before).

- **No more "Preparing stats" flashing.** Every new trace waits a few seconds for its stats on purpose, so with live
  traffic the banner showed "1 trace left" almost all the time. Now the hub and the cloud count only traces whose stats
  run more than a minute behind (after a restart, a stats rebuild, or a big copy). The banner then says "Stats are
  catching up", and search says "Search is catching up".

### Added

- **"A new version is ready" notice.** When a host starts a new release, an open dashboard shows a notice with
  Refresh and Later, and keeps working until you refresh. It checks `version.json` every 5 minutes, when the tab comes
  back into view, and when the live-update stream reconnects. A page whose file is gone after a release asks for a
  refresh instead of breaking.
- **Settle in worker threads (cloud, scale mode).** Indexing new traces runs in worker threads, so it uses more than one
  CPU core and ingest and pages stay fast during a backlog. `--settle-workers <n>` (`WIZELENS_CLOUD_SETTLE_WORKERS`);
  default CPUs − 1, at most 4; `0` keeps it in the main thread. A worker that dies fails only its batch, which settles
  again, and a new worker takes its place. The production pod has 2 CPUs and 2 workers.
- **A full page for each service** (`#/services/<name>`). It shows health, requests, error rate, and latency against the
  window before; traffic and latency over time; every endpoint or query; who calls the service and what it calls; and for
  APIs and workers its top errors, slowest requests, newest log lines, runtime metrics, and hosts. The quick look on the
  Services page has a "View full service" button. Search and the Overview's service list open the full page.

## [0.3.0-alpha.3] — Search and scale

One search language everywhere, the cloud on ClickHouse at scale, live updates, traces across projects, and trace times you can trust.

### Fixed

- **A wrong clock no longer makes a request hours long.** Next.js dates its `NextNodeServer.clientComponentLoading` span
  from an old chunk load, so a 44 ms page read as 2,181 s. A span that starts before its parent in the same service now
  starts with its parent. A browser whose clock was 4.6 hours behind (a crawler's renderer) made a page read as 4.6 hours:
  the browser now sends its clock with each batch, and the add-on (Node and .NET) moves the browser's times onto its own
  when they differ by more than 10 s.
- **Health checks are not traced** (Node and .NET). Kubernetes probes, Google and AWS load balancer checks, and Google
  uptime checks were about 200 traces an hour on three small apps and hid every visit. The request runs with tracing off,
  so Next.js and database spans do not start traces of their own either.

- **Old pods no longer pile up in the service list.** The registry has one row per host, so every Kubernetes pod made a
  new row, and the cloud never dropped them. The cloud now drops rows not heard from within the organization's retention
  (the hub already did). The dashboard shows one row per service with "2 of 3 online"; a click shows its hosts, and hosts
  offline for more than a day hide behind "Show old hosts". The top menu counts services, not pods.
- **Admins can forget offline hosts** in the cloud (`POST api/projects/{p}/services/forget`). Each service keeps its newest
  host, traces stay, and the audit log records it.
- **The Ctrl+K backdrop covers the whole page.** It was inside the top bar, whose blur limited it to the top bar's box.
- **Enter in the search box never picks a stale suggestion.** The list for the previous term stayed up while the new one
  loaded, so a quick Enter replaced the word with an unrelated value.
- **Pages no longer time out when counting is slow.** Every page asked for the project's trace and span counts and
  environments; on a busy database those scans filled all 10 Postgres connections. They are now shared for a minute
  (one scan per project at a time), and every query stops after 2 minutes.
- **The cloud starts at once after a facts version change.** It cleared every stat in one Postgres transaction before it
  listened; on a big database that took longer than the startup probe, so the pod restarted forever. The reset now runs
  after start, in batches that commit, and settling waits for it.

### Search

- **One search language everywhere** (docs/SEARCH-PLAN.md): words and `"phrases"`, `field:value` (service, env, trace,
  span, name, method, path, route, status, duration, level, category, kind, user, error, message), `@attribute:value` for
  any span or log attribute, `>`/`>=`/`<`/`<=`, ranges `a..b`, `*` wildcards, `-`/`NOT`, `OR`, and parentheses. Mistakes
  come back with the position of the bad part. Shared test cases in `docs/search-vectors.json`.
- **A Search page** finds requests, traces, spans, and log lines, with autocomplete for fields, attribute keys, and the
  common values of each, and "Show more" paging. Ctrl+K asks the host too, and offers "Search everything".
- **`api/search` and `api/search/suggest`** on the add-on (memory), the hub (SQLite), and the cloud (Postgres), with the
  `search` capability. Results page with a cursor, newest first. The hub and cloud keep `fact_search` and `fact_attrs`
  rows, built when traces settle (facts version 2, so stats rebuild once; cloud migration 8).
- **MCP `search` and `search_fields`**: AI agents search with the same language, on the host's whole store.
- Request searches also match the error messages of the request's spans.
- **Indexed "contains" searches.** The hub keeps SQLite FTS5 trigram indexes over the search text of search rows,
  requests, traces, and log lines, so words of 3 or more characters read an index instead of the whole time window (an
  older hub file fills them once on start). The cloud on Postgres adds `pg_trgm` GIN indexes after it starts, without
  blocking writes; a database without `pg_trgm` keeps scanning, with the same results.
- **MCP `list_traces`, `get_errors`, and `find_slow_queries` read the whole store**, not the newest 500 traces, and take a
  `range` (default 24h), on the add-ons too. `list_traces` also takes `q` in the search language. `find_slow_queries` returns the slowest
  queries, not the newest. The newest traces, which the store indexes once they go quiet, are merged in.

### Live updates

- **Open pages reload as soon as new data is in**, like Supabase's dashboard: the cloud and the hub stream `api/changes`
  (server-sent events, capability `changes`) each time settling builds new stats for a project. The page keeps its numbers
  on screen until the new ones arrive, so nothing flickers. One stream per tab; without it, pages still reload every 15 s.

### Cloud scale mode: telemetry in ClickHouse

- **`--clickhouse <url>`** (`WIZELENS_CLOUD_CLICKHOUSE_URL`) keeps spans, logs, metrics, and every stat and search table in
  ClickHouse 26.8; Postgres keeps accounts and settings, so heavy searches and 30-day pages never slow sign-in or ingest keys.
  Without it, nothing changes (small mode). Pages, searches, autocomplete, metrics, and alerts give the same answers on both:
  the parity tests run the same cases on memory, SQLite, Postgres, and ClickHouse (in CI, ClickHouse runs on the Linux job).
- Everything that touches telemetry goes through one `TelemetryStore`. Retention is a TTL per row; deleting or clearing a project
  removes its rows there too.
- **`wizelens-cloud copy-telemetry`** copies an existing database's telemetry into ClickHouse before switching.
- **Faster on ClickHouse.** Time filters now use the sort key (whole-number literals against Float64 columns kept
  ClickHouse from matching the key). Rollup sums read the raw rows instead of the merged `FINAL` views. Searches fetch only
  the rows of the page instead of joining the project's whole table, and look at the newest day first. The search text has
  a text index instead of an n-gram bloom filter that matched every block. In the load test on 960,000 spans: the
  overview page 2.2 s to 0.3 s, searches 155–732 ms to 42–186 ms (a rare phrase over 30 days still takes about 450 ms).
- **Settling keeps up better**: batches of 2,000 that overlap, written to all tables at once, merged in place, and run back
  to back while a backlog lasts (461 to about 935 traces/s). Its inserts carry deduplication tokens, so one dropped
  connection is retried without counting twice; reads are retried too. A failed batch no longer stops the cloud.
- **Column statistics are off** on ClickHouse: one read failed with `UNKNOWN_CODEC` while loading them under load. The
  hosted ClickHouse gets 4 GiB (was 3).
- **`scripts/load-test.mjs`** sends synthetic traffic to a cloud and times ingest, indexing, searches, and pages against
  the plan's targets. `--ingest-per-minute` (`WIZELENS_CLOUD_INGEST_PER_MINUTE`) raises the per-key ingest limit for it.
- `deploy/docker-compose.cloud.yml` has a `scale` profile with ClickHouse. The hosted cloud gets a ClickHouse StatefulSet with a
  nightly `BACKUP` to Azure Blob (`deploy/README.md`, "ClickHouse").

### Dashboard: Team, Account, and Settings rebuilt

- **Team, Account, and Settings have sections** (a list on the left, tabs on small screens), one at a time, each with its own
  link (`#/team/keys`, `#/account/security`, `#/settings/connect`). They were long stacks of up to 10 panels (Team was 3300 px tall).
- **Forms open from a button** ("Invite someone", "New project", "New key", "Add provider") instead of always showing. Fields,
  drop-downs, and buttons in a form row line up at the top, so a hint under one field no longer pushes the others down
  (Organization, single sign-on, keys). Every drop-down in a form has a visible label.
- **Dialogs in the dashboard's style** replace the browser's confirm and prompt boxes: removing people, cancelling invites,
  revoking keys and links, removing providers, passkeys. Clearing or deleting a project asks you to type its name. Two-step
  sign-in shows buttons first and asks for the password in a dialog.
- **The audit log reads as words**: who (a name or key, not a user id), what ("Made a key"), and the facts, with project and
  key names in place of ids. Roles show as Viewer, Member, Admin, Owner, with what each may do next to the role picker.
- **Read keys pick several projects** in the dashboard (the API already allowed it).
- **Settings fits each mode**: the cloud no longer shows add-on rows it does not have (host, N+1 threshold) or says "SQLite"
  for PGlite (the cloud reports Postgres). A service's sampling shows again. The options table lists every option, including
  `Enabled`, `Dashboard`, and sampling, with its environment variable.
- **Fixed everywhere**: a new page starts at the top (it kept the last page's scroll); number cards no longer squeeze
  "No data for previous day" into a narrow column (the trend line runs along the bottom); page actions such as "New alert" sit
  on the right of the title; the search box no longer cuts its text; flush tables line up with their panel titles; the cloud
  says "Sending to this project", not "Connected to this hub"; Error Rate has the same icon on every page.
- **Requests**: the table has the full width until you pick a request (no empty "Select a request" panel); with the details
  open, Fetch and Insights make room, so the table no longer scrolls sideways at 1440 px. Paths get more room.
- **Metrics**: names wrap at their dots, so the end (`.p50`, `.p99`) always shows; the list is wider, and the runtime tiles
  fill their row.
- Tab bars no longer show a scroll arrow when their tabs fit.

### Traces across projects

- **A trace that crosses projects opens whole in the cloud**: a front end in one project and the shared API it calls in
  another show as one trace. `api/traces/{id}` adds the parts from the other projects the caller may read, in the same
  organization only. A read key gets only its own projects. `join=false` turns it off. Lists, stats, and alerts stay per project.
- MCP `get_trace` and share links join the same way: a read key as far as its projects, a share link as far as its maker
  may read when it is opened (only the shared project once the maker leaves the organization).

### Cloud MCP

- **A read key for several projects connects**: before, the cloud MCP endpoint refused every call without `?project=`, so
  an agent's tool link failed at start. Now `list_projects` names the key's projects, and every tool takes a `project`
  argument (id or name). A key for one project, or `?project=`, works as before.
- The cloud loads a project's recent traces only when a tool reads them, not on every MCP request.
- Tests connect a real MCP client (initialize, tools/list, a call) to the cloud (also on ClickHouse), the hub, and the
  Node and .NET add-ons.

### Cloud mail

- `--mail-reply-to` (`WIZELENS_CLOUD_MAIL_REPLY_TO`) sets where replies go, for a sender address with no inbox (Resend and SMTP).
- The hosted cloud sends from `hello@updates.wizelens.com`, with replies to `hello@wizelens.com`.
- The sender name is "WizeLens Hello".
- Emails show their status: the mark's center dot and a stripe across the top of the card use the email's tone
  (blue for notices, green when good, amber for warnings, red for problems). The dot after "WizeLens" is gone.
- The site build makes the four mail marks and a BIMI logo (`/brand/bimi.svg`, SVG Tiny PS) for inbox sender pictures.

## [0.3.0-alpha.2] — Send-only in production

Ready for production: the add-ons send to the cloud and serve nothing anyone can read, and cloud sign-in moves to Better Auth.

### Send-only in production

- **The add-ons are send-only outside development** (.NET: outside the Development environment; Node and Next.js: when
  `NODE_ENV=production`). They still capture and send to the hub or cloud and take browser spans, but serve no dashboard,
  read API, or MCP: every other path under `/_wizelens` is a 404, so nobody can read traces from a production app.
  Traces stay in memory, and the hub gets no address to read from. Turn the dashboard on anyway with `Dashboard` /
  `dashboard` or `WIZELENS_DASHBOARD=true`.
- **`WIZELENS_ENABLED`** turns an add-on on or off with no code change (the option still wins).
- **Browser:** `<WizeLensProvider hud={false}>` (recorder option `readServer: false`) sends spans but never reads traces back.
- .NET: `Storage` is now nullable; unset means SQLite with the dashboard and memory without it.

### Cloud notices and digests

- **Security notices**, always on: password changed (also after a reset), email changed (sent to the old address), two-step
  sign-in on or off, passkey added or removed, new backup codes, and a sign-in on a new browser and system.
- **Team change emails** for owners and admins, from the audit log, grouped per batch and leaving out the reader's own changes.
  A member hears when their own role changes; every member hears when the organization is deleted.
- **Project health emails**: a busy project went quiet for 2 hours, and when its data is back.
- **Digests**: daily, weekly, and monthly per project, at each person's hour and time zone, with requests, error rate, average
  and p95 time, SQL queries, alerts fired, top errors, slowest endpoints, and insights. Weekly is on by default.
- **Emails panel** on the Account page, `GET`/`PATCH api/me/notifications`, and one-click stop links (`List-Unsubscribe`,
  RFC 8058) on team, health, and digest emails.
- Email templates gain stat tiles and lists. Migration 7 adds `mail_prefs`, `digest_prefs`, `digest_sends`, `known_devices`,
  `project_health`, and `audit.noticed` (older audit lines count as noticed, so an upgrade sends nothing for the past).

### Cloud email: Resend, templates, and a suppression list

- **Resend:** `--resend-api-key` (`WIZELENS_CLOUD_RESEND_API_KEY`) sends every email through the Resend API, in place of SMTP
  (never both). Each email has an idempotency key and is tried up to 4 times on 429 and 5xx answers, using `Retry-After`.
- **Bounces and complaints:** a Resend webhook to `/_wizelens/api/mail/resend` with `--resend-webhook-secret`
  (`WIZELENS_CLOUD_RESEND_WEBHOOK_SECRET`). The Svix signature is checked (5-minute window). After a hard bounce no mail goes to the
  address; after a spam complaint only mail the person asked for goes there. Confirming the address by link clears it.
  Migration 6 adds `mail_suppressions`.
- **Email templates:** every email is content only (heading, text, facts, one button, footer) in `mail/emails.ts`, drawn by one
  React Email layout (`mail/layout.tsx`) and one brand theme (`mail/theme.ts`), with a plain-text version from the same content.
  Alert emails show the project, value, threshold, and time, with a red dot when they fire and green when they resolve.
  `pnpm --filter @wizeworks/lens-cloud email:preview <folder>` writes every email to HTML and text.
- The start log says which mail service is on (`Mail  Resend`), and warns when Resend runs without the webhook secret.

### Cloud accounts on Better Auth

- **Sign-in is now [Better Auth](https://better-auth.com)** (pinned to 1.7.10), in place of the hand-written accounts. It runs at
  `/_wizelens/api/auth/*` and also handles organizations, members, roles, and invites.
- **New for people:** password reset and email confirm by link; change email (confirmed by the old address first) and change
  password (optionally signing out other devices); two-step sign-in with an authenticator app and 10 backup codes; passkeys;
  a list of signed-in devices with sign-out per device; delete your account (refused while you are the last owner of a team);
  delete an organization (owners, with the password). A new **Account** page in the dashboard.
- **Single sign-on per organization** with Better Auth's SSO plugin: owners and admins connect OIDC (Okta, Entra ID, Google,
  Auth0, Keycloak) or SAML 2.0 on the Team page. Sign-in works once the email domain is proven with a DNS TXT record; new people
  from that domain join as members, with a confirmed email. The sign-in page shows "Sign in with SSO" once a provider is ready.
  OIDC needs the provider's origin in `--sso-origins` (`WIZELENS_CLOUD_SSO_ORIGINS`), so the cloud fetches from no other place.
  Migration 5 adds `sso_providers`.
- **Email:** `--smtp-url` and `--mail-from` send confirm, reset, invite, delete, and alert emails. Alert rules can email members of
  the organization. Without SMTP, emails are written to the log.
- **Safer by default:** the first account needs a one-time setup link the cloud prints at start, so nobody else can claim a fresh
  cloud. Sign-in tries are limited per client address on every instance (`--trust-proxy` behind your own proxy). Passwords are
  12 to 128 characters, and breached passwords are refused with Postgres (`--[no-]check-pwned-passwords`). Sessions are checked in
  the database on every request, so a sign-out or a removed member takes effect at once. Invite ids are never listed to members.
  A database trigger keeps one owner in every organization.
- **Upgrade:** set `--auth-secret` (`WIZELENS_CLOUD_AUTH_SECRET`, 32+ random characters; required with Postgres). Migration 4 keeps
  people, organizations, members, projects, and keys; old passwords still work and are rehashed at the next sign-in. Everyone signs
  in once more. Open invites get new links: copy them again from the Team page.
- **API changes:** `api/auth/state` is now `api/me`. `api/auth/setup`, `signup`, `login`, `logout`, `invites/*`, `api/orgs/{org}/invites`,
  and `api/orgs/{org}/members/*` are gone: use Better Auth's routes. New: `GET api/invites/{id}`, `DELETE api/orgs/{org}`.
- `scripts/cloud-smoke.mjs` takes the setup token, and waits for stats to settle (it failed on a fresh cloud since the stats change).

## [0.3.0-alpha.1] — Phase 3: the cloud

The hosted service for many teams, and fixes found by running WizeLens in a large multi-pane React app with a Fastify API and Prisma.

### Next.js, page loads that join the server, and sampling

- **Next.js:** `registerWizeLens()` from `@wizeworks/lens-node/next` in `instrumentation.ts`. Each request is one trace named by
  its route, with Next.js's own render, route handler, and fetch steps inside it; the dashboard is served on the Next.js port with
  no route file; `onRequestError` records server errors once, with a log line.
- **The page load joins the server's trace.** Responses carry `Server-Timing: wl-trace;desc=…, wl-endpoint;desc="…"`; the page
  load uses that trace id, and browser spans go to the server that holds their trace (same origin only). The HUD reads each
  request from the server that answered it.
- **Sampling** for the Node and .NET add-ons: `sampling: { rate }` / `Sampling.Rate` / `WIZELENS_SAMPLE_RATE`. The choice comes
  from the trace id, so every service keeps the same traces; traces with an error or a slow server-side span are kept at any
  rate. The Settings page shows it.
- Fixed: database spans that name only the operation and table (Better Auth) now count as database calls.
- Fixed: federation and hub sends are no longer recorded as app traffic under Next.js.
- Fixed: the browser no longer records its own calls to another service's `/_wizelens` API.
- Fixed: alert notices say what happened (`above 5`, `no longer above 5`, `alerts when above 5`), and `PATCH` on an alert rule
  changes only the fields it sends.

### Stats from the database, with no read limits

- **Hub and cloud pages are computed in the database.** A background job sums each finished trace into totals per 10 seconds,
  5 minutes, and 1 hour (`rollup_*`, `hist_*`), plus small row tables for the lists (`fact_*`). Pages read those, so the cloud's
  20,000-trace read limit (`maxStatsTraces`) and the 200,000-point metric limit (`maxMetricPoints`) are gone, with no sampling banner.
  A late span sums its trace again; pruned traces come out of the totals.
- **The hub serves pages too** (`api/models/{page}`, capability `serverStats`), so its range goes to 7 days instead of 24 hours.
- **One code path:** every page is a `PageDef` in `@wizeworks/lens-core` (`PAGES`) that lists what it needs. The cloud and hub answer
  in SQL; in-app dashboards answer the same needs in the browser.
- **Metrics** are summed per series at ingest into the same three tiers; the Metrics page and metric alerts read them.
- Counts, sums, and averages are exact. p50, p95, and p99 come from a histogram and are within 2%.
- After an upgrade, pages say "Preparing stats" while older traces are summed (hub: about 100 to 200 traces per second).
  An upgraded cloud fills metric totals from new points only.
- Measured: 30,000 traces over 7 days on the hub and 42,000 on Postgres at 200 traces per second; every page answered in under 60 ms.
- Changes you can see: service-to-service edges list the busiest first; a selected queue or worker on Services shows real traffic
  (it showed zeros); 24-hour, 7-day, and 30-day ranges start on a 5-minute or 1-hour edge, so they can be up to an hour longer.

### Metrics

- A new **Metrics** page: CPU, memory, heap, event loop, garbage collection, request times, and your own counters, per service.
  Counters show as a rate per second, histograms as p50, p95, and p99. Lines can be split by service or by any attribute.
- **Node:** runtime metrics every 10 seconds with no code, and `wizelensMetricExporter(wizelens)` for OpenTelemetry metrics.
- **.NET:** every `Meter` with no code: the .NET runtime, ASP.NET Core, `HttpClient`, and your own meters.
- **Hub and cloud:** OTLP metrics at `/v1/metrics` (JSON or protobuf) from any language. The cloud adds metric alert rules.
- Add-ons keep one hour (`api/metrics/points`) and send metrics to the hub or cloud with the traces.
- MCP tools `list_metrics` and `get_metric`.

### Logs from the loggers apps already use

- **Node:** `console.*` calls during a request now go into its trace, with no code change (`captureConsole: false` turns it off).
  Fastify apps get `request.log` and `app.log` lines through `wizelensFastify`. New: `instrumentPino`, `instrumentWinston`,
  `instrumentBunyan`, `instrumentConsola`, `log4jsAppender`, `nestLogger` (NestJS), and `wizelensLogProcessor` (OpenTelemetry logs).
  Before, only `wizelens.logger` lines were kept, so a Fastify app showed no logs.
- **.NET:** `WizeLens.Serilog` (`.WriteTo.WizeLens()`) and `WizeLens.NLog` (the `WizeLens` target). `UseSerilog()` replaces the
  `ILogger` providers, so Serilog apps showed no logs before.
- **Browser:** `@wizeworks/lens-react` copies `console.*` calls into the page view's trace (`captureConsole`). `api/client-spans`
  takes a `logs` list next to `spans`.

### Cloud (`@wizeworks/lens-cloud`)

- `wizelens-cloud` on Postgres (`DATABASE_URL`), or PGlite in-process for trials. Docker image `ghcr.io/brandonkorous/wizelens-cloud`
  and `deploy/docker-compose.cloud.yml` with Postgres.
- **Accounts and teams:** first-run setup, email and password sign-in, organizations with owner, admin, member, and viewer roles,
  invite links, and a Team page (members, projects, keys, shared links, organization settings, audit log).
- **Projects and keys:** ingest keys (`wl_ik_`) tie each sender to one project; add-ons use them as `WIZELENS_HUB_TOKEN`, OTLP apps
  as a bearer header. Read keys (`wl_rk_`) give AI agents and scripts read-only access to the projects you pick.
- **Server-side stats:** the server computes every page, so the time range goes to 7 and 30 days. Very busy ranges say when the numbers
  come from the newest part of the data.
- **Alerts:** rules on error rate, p95 and average latency, requests, new error types, and slow queries; checked every minute; notices
  to webhooks and Slack when a rule fires and when it resolves. The Alerts page and the bell show them.
- **Sharing:** read-only links to one trace, 1 to 30 days, with view counts, revocable.
- **AI access:** the MCP endpoint takes read keys only, and every tool call goes into the organization's audit log.
- **History:** retention per organization (default 30 days, up to 400); clear or delete a project's data.

### Dashboard

- Every page is now one model function in `@wizeworks/lens-core` (`PAGE_MODELS`). The browser runs it for in-app and hub; the cloud
  runs it on the server. Filters, sort, and paging live in the URL, so a view can be shared.
- Charts show dates on ranges of more than two days.

### Fixed

- **Database time in the HUD and dashboard was too high** when queries ran at the same time. It added them up, so a request could
  show more database time than server time. Database and outbound time are now wall time; "All queries added up" is shown beside it.
- **Span times were rounded to the millisecond** (OpenTelemetry anchors each span on `Date.now()`). Node spans now keep sub-ms
  start and end times, so fast queries keep their order on the timeline.
- **CORS preflights were traced** and filled half the request list in cross-origin apps. They are skipped now (Node and .NET).
- **`SET LOCAL`, `BEGIN`, and `COMMIT` were flagged as duplicate and N+1 queries.** Session statements are skipped by those rules (JS and .NET).
- **One slow first request became many "slow query" insights.** Slow queries that run together are now one "Database wait" insight,
  timed as wall time. A slow `SET` or `BEGIN` is a database wait too, not a slow query.
- **"Server render is 158% of render time"**: the share mixed page loads with in-app route changes. It now compares the same page loads.
- **Component hotspots blamed wrappers** (error boundaries, providers, framework internals) for their children's time.
  Components rank by their own render time now, and components with under 1 ms of own time raise nothing.
- **Image timing stopped after about 250 resources**, because it read the browser's resource buffer. It uses an observer now.
- **A failed request flashed past in the HUD** when background requests kept coming. Failures stay on the card for 8 seconds.
- **Counts did not match**: the Errors badge now equals Total Exceptions, and Insights Found is the same on the Overview and
  Insights pages. The Requests page shows "Requests With Insights".
- **A request the client left was saved as "200, 0 bytes"**, and the queries its handler ran afterwards counted as server time.
  Node now marks it `wizelens.request.aborted` with no status, the dashboard shows "Aborted", and server time only counts work inside the span.
- **A CORS layer could remove `X-WizeLens-Trace` from `Access-Control-Expose-Headers`.** The Node add-on merges the names back in.
- `<WizeLensProvider capturePages={false}>` was in the docs but did nothing. The prop now works.
- **The HUD broke hydration in server-rendered apps** (Next.js) when its panel was open, it was minimized, or requests were kept
  from the last page. It read those during the first render, which the server cannot do. The first render now matches the server; saved settings apply right after.
- **First paint was counted after the tab came back.** A page that loaded in a background tab showed a first paint of minutes, so
  "Client render" read 20 s. First paint now follows the largest-paint rule: paints after the tab was first hidden are skipped.
- **A page load was saved twice** when the provider mounted again on the same page (a hot reload in development). Only the first
  tracker on a page sends its full-load view.
- **The Web App error rate on the Errors page was far too high** (18% against 2.5% on Services). It counted browser fetches that
  failed but not the ones that reached the server. A request now counts for every service it touched.
- The Pages & Routes table says which columns come from full page loads only, so SSR time can be above render time without looking wrong.

## [0.2.0-alpha.1] — Phase 2: the local hub

One place for the traces of every service. Each add-on still keeps its own store and dashboard.

### Hub (`@wizeworks/lens-hub`)

- `npx @wizeworks/lens-hub` or `docker run -p 5960:5960 -v wizelens:/data ghcr.io/brandonkorous/wizelens-hub`.
- The full dashboard (`mode: "hub"`), the read API, a health check, and the read-only MCP endpoint (`--mcp`) over every service.
- One SQLite file (`~/.wizelens/hub/hub.db`): the newest 50,000 traces or 7 days (`--max-traces`, `--retention`).
- OTLP/HTTP intake at `/v1/traces` and `/v1/logs`: JSON or protobuf, gzip, older attribute names mapped. Any OpenTelemetry app can send.
- A service registry: online, idle, or offline; project, environment, host, runtime, and how it sends.
- Projects and environments: `WIZELENS_PROJECT` (OTLP: `service.namespace`) groups services. The top bar filters by both.
- Still federates to services that do not send to it. Hides remotes it already has, so nothing is read twice.
- Local only by default. `--host 0.0.0.0 --token <text>` for a team network (bearer header, or a one-time browser link that sets a cookie).
- `--import <file>` copies an add-on's `.wizelens/traces.db` into the hub.

### Add-ons

- .NET (`HubUrl`, `HubToken`, `Project`) and Node (`hub`, `hubToken`, `project`), or `WIZELENS_HUB`, `WIZELENS_HUB_TOKEN`, `WIZELENS_PROJECT`:
  send every span, log, and remote to the hub each second, with a heartbeat, a bounded queue, back-off, and one warning when the hub is down.
  Calls to the hub are never traced.
- `api/info` reports `project` and `hub`. The in-app Settings page links to the hub.
- Node: browser spans with the `messaging` category are kept (they were turned into `browser`).

### HUD

- Minimize to the WizeLens icon. The choice survives a refresh.

### Project

- The hub image is built and checked in CI. A version tag pushes it to GHCR.

## [0.1.0-alpha.1] — Phase 1: the in-app add-on

The first release. WizeLens runs inside each app, keeps its own traces, and serves the dashboard at `/_wizelens`.

### Capture

- **ASP.NET Core** (`WizeLens.AspNetCore`): requests, routing and handler time, outgoing `HttpClient` calls, `ILogger` logs, exceptions,
  request and response headers, client address, user, request id, body sizes, tags (`WizeLensRequest.Tag`), optional response bodies.
- **Databases (.NET):** EF Core (`WizeLens.EntityFrameworkCore`), any ADO.NET provider and Dapper through `ProfiledDbConnection`,
  and automatic capture of Npgsql, MySqlConnector, and Microsoft.Data.SqlClient.
- **gRPC and messaging (.NET):** Grpc.AspNetCore and Grpc.Net.Client, RabbitMQ.Client, Azure Service Bus, MassTransit, and Kafka through `WizeLens.Kafka`.
- **Node** (`@wizeworks/lens-node`): Express, Fastify, Koa, and Hono; outgoing `fetch`; routing time; logs; exceptions; the same request details and tags as .NET.
- **Databases (Node):** `pg`, `mysql2`, `better-sqlite3`, `node:sqlite`, Prisma, TypeORM, and Drizzle, one line each, plus `traceDb()` for any other driver.
- **gRPC and messaging (Node):** `@grpc/grpc-js`, `amqplib` (RabbitMQ), `kafkajs`, and `@azure/service-bus`. Trace context travels in message headers, so one trace follows a message across services.
  Pull-style receives (`channel.get`, `receiveMessages`) are recorded as receive spans. gRPC servers tell callers where their dashboard lives, so gRPC calls federate like HTTP.
- **Browser** (`@wizeworks/lens-react`): fetch spans linked to server traces, render time, page views with TTFB / SSR / FCP / LCP / INP / CLS,
  hydration, slow and oversized images, React component render stats, and browser errors.

### Dashboard

- Overview, Requests, Traces, Database, Rendering, Errors, Logs, Services, Insights, and Settings, plus a full trace page
  (timeline, SQL, HTTP, messages, logs, errors).
- Every number compares itself with the previous period. Search everything with Ctrl K. Light and dark themes. Works on phones and tablets.
- Reads every connected service and merges their traces in the browser, with clock-skew correction across services.
- Knows where it runs (`mode` and `capabilities` in `api/info`), ready for the local hub and the cloud.

### In-page HUD

- A corner card with Total, Server, Database, and Render time, health colors from the brand guide, hover cards, a small details panel,
  and links that open the full dashboard in a new tab.

### Analysis

- N+1 queries, N+1 HTTP calls, duplicate queries, slow queries, errors, render bottlenecks, and component hotspots, with the same rules in .NET and JS.

### AI access

- An opt-in, read-only, redacted MCP endpoint with five tools: `list_traces`, `get_trace`, `find_slow_queries`, `find_n_plus_one`, `get_errors`.

### Storage

- Traces survive restarts in a small SQLite file per app (newest 2,000 traces or 24 hours). Falls back to memory, and never breaks the app.

### Known limits

- Hono has no separate routing moment, so Hono requests have no routing time.
- Azure Service Bus on .NET links a processed message to its sender instead of making it a child, so the consumer starts its own trace.
- Npgsql and MySqlConnector do not report returned rows.
- Message sends and database calls are recorded inside a request (or a message handler) only. Startup and background work is skipped
  unless you turn on `traceQueriesOutsideRequests` (Node).

### Project

- CI on Linux and Windows: size rules, builds, all tests, and a trial pack. A release workflow publishes to npm and NuGet from a version tag.
- Code rules checked on every build: 250 lines per file, 50 lines per function, one-line comments.
