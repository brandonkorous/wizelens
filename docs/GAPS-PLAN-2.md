# WizeLens — Gaps Plan 2

Found 2026-10-20, after phases 0 to 20 of `GAPS-PLAN.md` were done. Three sweeps read the code: the dashboard, the
cloud and hub as a production service, and the SDKs. Each item names where the gap is. The phases are in build order:
safety fixes first, then the pieces that a paying team or a security review asks for, then reach.

The rules of `GAPS-PLAN.md` ("Rules for every phase") still hold.

## Status

| Phase | What | Size | State |
|---|---|---|---|
| 21 | Safety fixes: secrets, leaks, deletes, headers | S | |
| 22 | Dashboard bugs and polish | S | |
| 23 | Cloud on more than one pod | L | |
| 24 | Backups, restore, and safe upgrades | M | |
| 25 | Limits: rate, query time, cardinality, storage | M | |
| 26 | Org security policy and a full audit log | M | |
| 27 | Privacy and data rights | M | |
| 28 | Alerts that always land | M | |
| 29 | Public API and config as code | L | |
| 30 | Onboarding | M | |
| 31 | Dashboards 2 | L | |
| 32 | Links, keyboard, and narrow screens | M | |
| 33 | Explore: group by, top endpoints, chart tools | L | |
| 34 | The trace view and service map at scale | M | |
| 35 | Error triage 2 | M | |
| 36 | Sharing and reports | M | |
| 37 | Custom spans and OpenTelemetry interop | M | |
| 38 | Background work and crashes | M | |
| 39 | Browser monitoring 2 | L | |
| 40 | Same settings in every SDK | M | |
| 41 | Node library coverage 2 | M | |
| 42 | .NET, Go, and Python coverage 2 | M | |
| 43 | Serverless | L | |
| 44 | Continuous profiling | L | |
| 45 | Data residency (EU region) | L | |
| 46 | Supply chain, and the hub as a team service | M | |
| 47 | Mobile | XL | |

## Phase 21 — Safety fixes

Small, and each one is a leak or a broken promise today.

1. **Alert channel secrets in plain text.** Slack, Teams, Discord webhook URLs and PagerDuty keys are stored as typed
   and sent to viewers and read keys (`cloud/src/repo/alerts.ts:28`, `routes/alerts.ts:37-39`). Seal them like uptime
   headers (`uptime/headers.ts`), and send only a masked form (`hooks.slack.com/…/••••3f`).
2. **SSO client secrets in plain text** (`cloud/src/db/schema-sso.ts:5`). Seal them the same way.
3. **Query strings leak from Node and the browser.** `url.query` and `url.full` are raw
   (`node/src/request-attributes.ts:39-40`, `client-attributes.ts:26-27`), and the browser sends `location.href`
   (`browser/src/errors.ts:41`). Redact sensitive values as .NET does (`ActivityMapper.cs:31-37`).
4. **Account delete is incomplete.** `auth/delete-user.ts:201` clears Postgres only. Also clear ClickHouse, and stop on
   a live plan, as `routes/orgs.ts:274-278` does.
5. **No security headers** on the dashboard (`cloud/src/server.ts:75`). Add CSP, `frame-ancestors`, HSTS, and
   `X-Content-Type-Options` on cloud and hub.
6. **Oversized ingest gets 400, so exporters drop it.** Send 413 (`routes/ingest.ts:119-122`,
   `hub/src/otlp/index.ts:36-39`). Unzip off the main thread (`hub/src/body.ts:19`).
7. **Hub sign-in puts the token in the URL** (GET form, `hub/src/auth.ts:48`). Use POST and rate-limit guesses.
8. **The privacy policy says data never reaches WizeWorks** (`site/content/legal/privacy.md:20-29`). That is true for
   the hub, not the cloud. Split it, and add a subprocessor list (Azure, Cloudflare, Stripe, Resend). The user reviews
   legal text before it ships.

## Phase 22 — Dashboard bugs and polish

- **One-click deletes** with no confirm: alert rules, dashboards, SLOs, uptime checks, log charts
  (`AlertsPage.tsx:96`, `DashboardView.tsx:40`, `SloPage.tsx:44`, `CheckDetail.tsx:92`, `UptimePage.tsx:46`,
  `LogMetrics.tsx:38`). Use the confirm dialog that Team uses.
- **One crash blanks the app.** Add an error boundary per page, a `Suspense` fallback for lazy pages, and Retry on
  load errors (`App.tsx`, `ui/ModelState.tsx:110`).
- **Focus and contrast.** Put a focus style back where `outline: none` removes it (`ui.css:115`, `shell.css:57`).
  Fix light-theme success, error, and muted text to 4.5:1 (`tokens.css:15,21`).
- **Every tab has the same title** (`App.tsx:126`). Title each page: "Errors · api-rest · WizeLens".
- **Sort sorts one page.** On server-paged tables, a column click sets the server order (`ErrorTables.tsx:86,100`,
  `LogParts.tsx:134-135`).
- **Range not in the link** on Users, Hosts, Kubernetes, Dashboards, Uptime, SLOs. Hosts and Kubernetes also ignore a
  custom window and the service filter (`data/urlState.ts:90`, `data/infra.ts:309-314`, `data/models.ts:195-198`).
- **The bell and the health dot** read only the 300 newest traces in the browser on hub and cloud
  (`data/store.ts:24-26`). Read them from the server, and count open problems.
- **The SLO "Covers" link** assumes an API service (`SloPage.tsx:53`).
- **Stale doc:** `docs/node.md:111` says lines outside a request are skipped; they are kept by default now.

## Phase 23 — Cloud on more than one pod

Today every deploy is downtime, and a crash stops ingest (`deploy/k8s/base/cloud.yaml:7-10`: one replica, Recreate).

- Leases (as uptime and team notices have) for alert evaluation (`jobs.ts:370`) and every other timed job.
- The ClickHouse settle queue and metric write chain move out of memory (`telemetry/ch/queue.ts`,
  `telemetry/ch/metrics.ts:133-143`), so any pod can write and a restart loses nothing.
- Usage counters flush to Postgres on every batch, not once a minute (`billing/usage.ts:3`).
- A lock around migrations (`db/migrate.ts`).
- Two or more replicas, a rolling update, a PodDisruptionBudget, and readiness that waits for the database.
- **The cloud watches itself:** `/healthz` checks Postgres and ClickHouse (`server.ts:82`); a metrics endpoint
  (queue depth, job failures, mail failures); the cloud sends its own traces to a WizeLens project; alerts on a failed
  job or backup.

## Phase 24 — Backups, restore, and safe upgrades

- Postgres: point-in-time restore set up and written down, beside the ClickHouse section of `deploy/README.md`.
- ClickHouse: incremental backups through the day, not one full nightly one. Restore one tenant, not only all.
- A restore drill in CI on a schedule: restore last night's backup into a scratch database and count rows.
- Deploys: a staging overlay that runs first, a snapshot before migrations, and a written rollback step
  (`.github/workflows/deploy.yml`).

## Phase 25 — Limits

- Per-organization limits on ingest and reads, shared across pods. Today only ingest is limited, per key, in memory
  (`http/limiter.ts`), and more keys mean more allowance. Search, models, and MCP have none.
- ClickHouse `max_execution_time` on every query, so a dropped request stops its query (`telemetry/ch/http.ts:90`).
- Cardinality caps: metric series per project (`repo/metric-write.ts:54-68`) and attribute keys and values
  (`telemetry/ch/schema-facts.ts:43`). Over the cap, drop the extra and show it on Settings › Usage.
- Source maps count toward storage, with a cap on files per release (`routes/sourcemaps.ts:14-26`).

## Phase 26 — Org security policy and a full audit log

- **Policy per organization:** require 2FA, SSO only (no password sign-in once SSO is on, `auth/sso.ts:38-52`),
  an IP allow list, and admins can revoke a member's sessions. The member list shows who has 2FA.
- **Audit every change.** Today none for alert rules, mute and acknowledge, SLO edits, Apdex, saved views,
  dashboards, status page rename, notification settings, sign-ins, failed sign-ins, and 2FA or passkey changes.
- **Audit rows** get the IP address and user agent (`repo/audit.ts:12`), a retention setting, and a stream out
  (webhook) for a SIEM, a security event store.
- **Secret rotation** without signing everyone out (`auth/secret.ts:11`), uptime headers re-sealed on rotation
  (`uptime/headers.ts:18`), and SCIM tokens that rotate, not only revoke.

## Phase 27 — Privacy and data rights

- **Redact by value, not only by key** (`core/src/redact.ts:18-27`, .NET `Redactor.cs`): emails, card numbers, JWTs,
  and bearer tokens inside any value, in core and in every SDK.
- **SQL:** an option to replace inline literals with `?`, and a switch to turn off parameter capture in Node and .NET
  (`node/src/db.ts:35`, `DbActivity.cs:35`). Java, Python, and Go already make it opt-in.
- **A `beforeSend` hook** in every SDK, to change or drop a span, log, or error.
- **Data rights:** export everything for an organization; erase one end user's data by `enduser.id`; replace a removed
  member's email in old audit rows with a stand-in.

## Phase 28 — Alerts that always land

- A send queue with retries and backoff; each send shows in the rule's history (`hub/src/alerts/deliver.ts:82-89`).
- Signed webhooks (HMAC), so a receiver can check the sender.
- Teams through Workflows with Adaptive Cards; the `MessageCard` connector is being retired (`deliver.ts:69`).
- New channels: Opsgenie, and a Slack app (pick a channel, no webhook URL).
- Rules: a warning and a critical level, a preview of how the rule would have fired over the last 7 days, scheduled
  downtime windows, and an environment picker, not free text (`AlertForm.tsx:63-87`).

## Phase 29 — Public API and config as code

- An OpenAPI spec made from the routes, and an API reference page on the site.
- Keys with write scopes (`auth/principal.ts:83`: every key is read only today).
- A Terraform provider for projects, alert rules, SLOs, uptime checks, dashboards, and keys.

## Phase 30 — Onboarding

- A first-run screen on an empty project: pick a language, see the install steps, make a key on the spot (not
  `wl_ik_...`), and a "waiting for your first data" check that turns green.
- Steps for every SDK: Node, .NET, browser, Java, Python, Go, OTLP (`settings/HubConnect.tsx:121-131`).
- The empty Overview links to this, not to Settings › Connect (`overview/ActivityPanel.tsx:29`).

## Phase 31 — Dashboards 2

- Panels from any data: request rate, latency, errors, log counts, SLOs, uptime, and saved searches, not only metrics
  (`core/src/models/saved.ts:9-20`).
- Board variables (service, environment), drag and resize, rename, clone, JSON import and export.
- Say when a panel hides series (`PanelView.tsx:44,59`).
- Saved views and searches: rename, update, unshare, delete (`shell/SavedNav.tsx`).

## Phase 32 — Links, keyboard, and narrow screens

- **Rows are links** (`ui/Table.tsx:80` and the trace tabs): Ctrl-click opens a new tab, Tab and Enter work.
- **Keyboard:** arrow keys in tab bars and menus (`ui/Panel.tsx:71-79`, `shell/Menu.tsx`); shortcuts (`/` search,
  `g` then a letter to go to a page, `?` for help); the palette finds dashboards, users, checks, hosts, problems, and
  scrolls to the highlighted item (`shell/SearchPalette.tsx`).
- **Narrow screens:** below 1200 px the detail panel opens over the list or scrolls into view (`styles/ui.css:8`);
  labels on the phone nav bar; a top bar that wraps (`shell/TopBar.tsx:33-49`).

## Phase 33 — Explore

- **Search groups and counts:** count, p95, and sum by any field, and top N (`search/SearchPage.tsx`).
- **A Top Endpoints page** across every service, from the `traffic` model that only MCP uses today.
- **Traces list:** start time and service columns, and a latency heatmap on Traces and Requests.
- **Charts:** zoom out and back, step the range left and right, auto refresh, click a bucket to open its requests or
  logs, hide or isolate a series, and touch and keyboard support (`ui/TimeChart.tsx`).
- **Logs:** click an attribute to filter by it; "show the lines around this one" for lines outside a request.

## Phase 34 — The trace view and service map at scale

- Virtual rows in the waterfall, and a tree build and "Collapse all" that run once, not once per span
  (`trace/Waterfall.tsx:166,266,280`).
- The selected span in the URL; a flame graph view; zoom into part of the waterfall.
- Trace compare picks any trace from the server, not only the 300 in the browser (`trace/TraceTools.tsx:30`).
- Service map: pan, zoom, filter, "neighbours of this service", and Tab to each node (`services/DependencyMap.tsx`).

## Phase 35 — Error triage 2

- The assignee shows in the list, with an "assigned to me" filter (`ui/IssueControls.tsx:48`).
- Bulk resolve, ignore, and assign. Comments on a group.
- Link a group to a GitHub, Jira, or Linear issue.
- Trend and users columns in the list (`errors/ErrorTables.tsx:85-101`).

## Phase 36 — Sharing and reports

- "Share page" on every page, not nine (`shell/SharePage.tsx`).
- Export a chart or board as PNG. A scheduled email report per board.
- Search export saves every match, not only the loaded rows.

## Phase 37 — Custom spans and OpenTelemetry interop

- Node sets its tracer provider as the global one (`node/src/tracing.ts:66-77`), so `trace.getTracer()` and
  OpenTelemetry contrib instrumentations reach WizeLens. .NET listens to the app's own `ActivitySource` names from a
  setting (`WizeLensActivityListener.cs:12-16`).
- A "custom spans" docs page per SDK.
- OTLP: span links and `tracestate` (`hub/src/otlp/proto.ts:86-97`, core `Span`), metric exemplars, and OTLP over gRPC.

## Phase 38 — Background work and crashes

- A public way to start a trace for a job or a timer in Node and .NET. Outgoing HTTP and queries in that trace are
  kept (`node/src/http-client.ts:51-55`, `ExternalSources.cs:49`).
- Schedulers: node-cron, Agenda, Hangfire, Quartz.
- Crashes outside a request: `uncaughtException` and `unhandledRejection`, `AppDomain.UnhandledException` and
  `UnobservedTaskException`, `sys.excepthook`, Go panics, and the JVM default handler. Flush before exit.

## Phase 39 — Browser monitoring 2

- **Direct ingest:** the browser sends to the hub or cloud with a public key and CORS, so single-page apps on a CDN and
  apps with Java, Python, or Go back ends work (`browser/src/sender.ts:47`).
- Breadcrumbs (clicks, navigation, console, fetch), long tasks and long animation frames, full resource timing,
  interaction spans for INP (`page.ts:78`).
- Options: sample rate, `beforeSend`, `ignoreErrors`, `denyUrls` (`recorder-types.ts:50-75`). A retry buffer that
  survives offline time (`sender.ts:54`).
- A React `ErrorBoundary` helper, as Vue, Angular, and SvelteKit have.
- Session replay, last: record DOM changes, mask all text and inputs by default.

## Phase 40 — Same settings in every SDK

- Node and .NET read the same env vars as Java, Python, and Go: `WIZELENS_REDACT_KEYS`, `KEEP_ERRORS`, `KEEP_SLOW_MS`,
  `CAPTURE_BODY` (`node/src/sampling.ts:33`). .NET binds `appsettings`. The auto installs read them too.
- Sampling: per-route rules, a public ignore list for health checks, and a traces-per-second cap.
- Request bodies (opt-in) in Node and .NET; WebFlux in Java (`core/src/attributes.ts:77`).
- `setUser` in .NET, Java, Python, and Go, so their Users pages fill (`RequestEnricher.cs:47`).

## Phase 41 — Node library coverage 2

- Frameworks: tRPC, React Router 7 and Remix, SvelteKit server, Nuxt and h3, Astro, hapi (`auto/frameworks.ts`).
- Stores: mssql and tedious, oracledb, cassandra-driver, memcached. ORM spans for Knex, Sequelize, Kysely, MikroORM,
  and Mongoose. TypeORM and Drizzle in the auto install (`auto/libraries.ts:49-69`).
- AWS SDK v3: S3, DynamoDB, SNS (with trace propagation), Lambda invoke.
- Messaging and more: Google Pub/Sub, NATS, Redis pub/sub and streams, ws and Socket.IO, OpenAI and Anthropic SDKs.
- A pino and winston hook that writes the trace id into the app's own log lines.

## Phase 42 — .NET, Go, and Python coverage 2

- .NET: Hangfire, Quartz, MediatR, HotChocolate, AWSSDK, Cosmos DB, Blob Storage, Event Hubs, SignalR. The zero-code
  hook loads every WizeLens package that the app has (`WizeLens.AutoInstrumentation.csproj`). log4net.
- Go: gRPC, Gin, Echo, chi (route names, not one name per handler, `go/http.go:18`), Redis, Kafka, zap, zerolog,
  logrus, and runtime metrics (`go/start.go`).
- Python: runtime metrics and loguru. The runtime panel learns CPython, Go, and JVM thread names
  (`core/src/metrics/runtime.ts:13-21`).

## Phase 43 — Serverless

- AWS Lambda wrappers for Node, .NET, and Python: one trace per call, cold start, and a flush before the call ends
  (`node/src/hub-export.ts:87` sends on a timer, which a frozen Lambda loses).
- Azure Functions for .NET and Node.
- Edge runtimes (Vercel Edge, Next middleware, Cloudflare Workers): a fetch-based exporter with no Node APIs
  (`site/content/docs/nextjs.md:22`).

## Phase 44 — Continuous profiling

- Sample CPU and heap all the time at low cost: Node (`inspector`), .NET (EventPipe), JVM (JFR), Go (pprof),
  Python.
- Ingest OTLP profiles on hub and cloud (`routes/ingest.ts:78`), store them by service and version.
- A Profiles page: a flame graph per service and endpoint, compare two versions, and a link from a slow trace to the
  profile of that time.

## Phase 45 — Data residency

- An EU cluster. Each organization has a region set at sign-up; its data stays there (`deploy/README.md:3`).
- Sign-in and billing stay global; the dashboard and keys route to the right region.

## Phase 46 — Supply chain, and the hub as a team service

- CI: CodeQL, Dependabot, an image scan (Trivy), an SBOM, and signed images with provenance (`deploy.yml` sets
  `provenance: false`).
- Hub: users and roles, an audit log, built-in TLS, a backup command for its SQLite file, and no start on `0.0.0.0`
  without a token (`hub/src/cli.ts:11`).

## Phase 47 — Mobile

- React Native first: crashes, screens, network calls, and app start time, joined to back-end traces.
- Then native iOS (Swift) and Android (Kotlin).
