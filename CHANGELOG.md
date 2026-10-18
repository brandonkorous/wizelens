# Changelog

All notable changes to WizeLens. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Traces across projects

- **A trace that crosses projects opens whole in the cloud**: a front end in one project and the shared API it calls in
  another show as one trace. `api/traces/{id}` adds the parts from the other projects the caller may read, in the same
  organization only. A read key gets only its own projects. `join=false` turns it off. Lists, stats, and alerts stay per project.
- MCP `get_trace` and share links join the same way: a read key as far as its projects, a share link as far as its maker
  may read when it is opened (only the shared project once the maker leaves the organization).

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
