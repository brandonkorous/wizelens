# WizeLens — Core Feature Gaps Plan

Found 2026-10-19 by reading every page, model, host, and SDK. Each item names where the gap is. The phases are in
build order: bugs first, then the shared pieces (filters, URL state) that later phases stand on.

Phases 14 to 20 were added the same day from a comparison with Datadog, Dynatrace, and New Relic: the gaps that
APM buyers expect and that phases 0 to 13 do not cover.

## Status

| Phase | What | Size | State |
|---|---|---|---|
| 0 | Bugs and loose ends | S | Done |
| 1 | Filters on every page, and a global service filter | L | Done |
| 2 | Time and URL state: links that keep the view, custom range, zoom, live tail | M | Done |
| 3 | Detail pages: error group, endpoint, query, route; a better trace page | L | Done |
| 4 | Error tracker workflow: resolve, ignore, regressed, true first seen | M | Done |
| 5 | Releases: markers, compare versions, new in this release | M | Done |
| 6 | Alerts: scope, mute, history, hub alerts, more channels | M | Done |
| 7 | SLOs, Apdex, and error budgets | M | Done |
| 8 | Saving and sharing: saved views and searches, dashboards, exports | L | Done |
| 9 | Search everywhere: query bar on list pages, more kinds | M | Done |
| 10 | Users: users affected, user filter, user page | M | Done |
| 11 | Settings and Team | M | Done |
| 12 | AI tools (MCP) see what the UI shows | S | Done |
| 13 | SDK coverage | L | Not started |
| 14 | Browser source maps | M | Done |
| 15 | Uptime checks | M | Done |
| 16 | Logs as a product: all logs, patterns, log alerts | L | Done |
| 17 | Anomaly detection and problems | L | Done |
| 18 | Hosts and Kubernetes | L | Done |
| 19 | Install with no code change | L | Done |
| 20 | Java, Python, and Go | XL | Done |

## Rules for every phase

- A model change keeps parity on memory, SQLite (hub), Postgres, and ClickHouse (cloud): add the new params to
  `core/src/testing/scale-pages.ts` and the parity tests run them on all four.
- A filter that needs a new rollup key or fact column bumps `FACTS_VERSION`. Hosts then rebuild their stats; on the
  production ClickHouse that is a re-settle, so batch such changes into one release.
- Filters live in the URL (`setQuery`), so every view can be linked.
- New pages follow the service page: a header panel with a back link, `wl-grid-stats` cards, Title Case panel titles,
  flush tables, `wl-` classes, and 250 lines per file.

## Phase 0 — Bugs and loose ends

1. **An error link can open the wrong error.** `ErrorDetailsPanel` falls back to the first group when the key is not in
   the newest 200 (`ui/pages/errors/ErrorDetails.tsx:73`). The service page links to its most frequent groups, which
   may be older. Fix: the errors model reads `group` and fetches that group by key; the UI says "not in this range".
2. **The trace page ignores the app's thresholds.** `analyzeTrace(trace)` runs with 100 ms and 5 repeats
   (`ui/pages/trace/TraceDetailPage.tsx:46`), not the host's `analysis.slowQueryMs` / `nPlusOneThreshold`.
3. **Counts that hide cut lists.** The Database total (`queryShapes`, `models/database.ts:108`), Rendering
   `componentCount` (`rendering.ts:93`), and Traces `matching` are computed but not shown. Show "200 of 1,240".
4. **"Top Slow Queries"** lists every query by average (`DbTables.tsx:36`). Rename it, or sort by total time.
5. **Dead params.** The errors model ignores `q`, and the rendering model ignores `all`, though the parity
   list passes them (`testing/scale-pages.ts:33-34`). They become real in phase 1.
6. **Links that lose context.** The Traces "View all" drops `q` (`RecentTraces.tsx:37`). "View affected requests"
   searches the path as text and shows healthy requests too (`ErrorDetails.tsx:36`). Database insight cards open a
   trace, not the insight (`InsightCards.tsx:12`). The critical spans "View all" shows with 6 spans or fewer.
7. **Alerts on hosts without alerts.** `#/alerts` still opens and calls a cloud-only API (`App.tsx:50`).
8. **Alert notice links** add `?project=<id>` (`cloud/src/alerts/evaluate.ts:21`), and the UI ignores it.
9. **Filter rules differ.** An unknown `status` matches nothing; an unknown `duration` is ignored
   (`request-filter.ts:41-47`). Make both ignore unknown values.
10. **Stale docs.** The CONTRACT capability table (`docs/CONTRACT.md:128, 200, 206, 528`) misses `search` and gives the
    hub too few capabilities. `docs/PLAN.md:44` says SSO and email are not built; they are. `SEARCH-PLAN.md:13` too.

## Phase 1 — Filters on every page

Today only Requests, Logs, and Metrics filter by service. Overview, Errors, Database, Rendering, Insights, and Traces
take no params besides a selection.

- **Global service filter.** Scope becomes environment, project, and service. The top-bar menu's services list is
  display-only today (`shell/HubMenu.tsx:121-124`); its rows become choices. Every model reads `service`.
- **Errors:** service (the `err.g` key starts with it, so it is a prefix filter), type, endpoint, critical, browser or
  server, and text search. Order by last seen or by count on the server, with paging and a total, so busy old groups
  are not cut. The Top Error Types bars and Errors by Service rows become filters.
- **Database:** search, service, database and system, table, operation. Server-side order by average, count, or total
  time, with paging. New columns: max, total time, slow, errors (already computed, `database.ts:51`). The endpoint
  chip links to the endpoint. Needs a service part on `db.q` keys (facts change).
- **Rendering:** route search and route filter; columns for LCP and large images (computed, `render-rows.ts:38-40`).
- **Traces:** status, duration, service, sort, paging with a total (the list stops at 10 today, `traces.ts:13`).
- **Logs:** trace (`ListFilter.traceId` exists, `scale/needs.ts:52`), category, exact level. Rows expand to show
  attributes (`LogRow.attributes` is never shown).
- **Requests:** exact endpoint (route), user, has insights or an insight kind, error type; sort by errors and database
  time. Pages that link here with `q=<path>` switch to the exact filters.
- **Insights:** service and endpoint.
- The service page's "View errors" and "View database" links pass the service.

## Phase 2 — Time and URL state

- **Range, environment, and project in the URL**, next to the page filters. Shared links then show the same view,
  and alert links open the right project. The saved choice stays the default.
- **Custom range** (from and to). Models take an absolute window; the search API already reads `from` and `to`
  (`core/search/request.ts:14-15`).
- **Drag to zoom** on every `TimeChart` (it has no selection today, `ui/TimeChart.tsx:154`), which sets the range.
- **Compare** a chart with the period before, as a faint line; pick "a week ago" as well as "the period before".
- **Time zone:** local or UTC, and 12 or 24 hour. All times use the browser zone today (`format.ts`).
- **Live tail** for Logs and Requests, with pause, on hosts with the `changes` stream.

## Phase 3 — Detail pages

- **Error group page** `#/errors/<key>`: occurrences over time, the list of occurrences (the 50 trace ids are
  computed and never shown, `errors.ts:47`), endpoints, users affected, browsers, and the latest stack. "Failed
  requests" opens Requests with the route and `status=failed`.
- **Endpoint page** `#/services/<service>/endpoints/<route>`: count, errors, p50, p95, p99 over time, slowest
  requests, its queries and outgoing calls. Needs a histogram on `svc.ep` (no p95 per endpoint today,
  `service-detail.ts:11-16`). Endpoint rows on the service page open it.
- **Query page** (Database): trend, the endpoints and services that run it, slow examples, and its requests.
- **Route page** (Rendering): Web Vitals over time (LCP included), its components, slow page loads.
- **Trace page:** span search and an "errors only" toggle; expand and collapse all; critical path and self time; a
  span links to its error group, its log lines, and its service and endpoint pages; click an attribute to search it;
  download the trace as JSON; compare two traces side by side.
- **Dependency map:** edges can be clicked, show p95 and error rate, and nodes open the service page.
- **Stat cards** link to the list behind them (for example "Error Rate" to failed requests).

## Phase 4 — Error tracker workflow

- **State per error group:** unresolved, resolved, ignored (for a time, or for good). A resolved group that happens
  again is **regressed**. Hub: a SQLite table; cloud: a Postgres table keyed by project and group key; in-app: none
  (the page shows no actions there).
- **True first seen:** saved per group when its first event settles. "First seen" shows this, not the window start
  (`ErrorDetails.tsx:58`). Badges for new and regressed groups; a "New" filter.
- **Assign** a group to a member (cloud), with an audit line.
- **Insights** get the same: dismiss, mark fixed, and regressed when they come back.
- The Overview gets a "New and regressed errors" panel.

## Phase 5 — Releases

- Keep `service.version` on facts, so numbers can be split by version (facts change).
- **Release markers** on every chart: the time a new version first sent data.
- **Compare versions** of a service: error rate, p95, and new error groups, on the service page.
- **"New in this release"** filter on Errors and Insights.

## Phase 6 — Alerts

- **Hub alerts:** the evaluator runs in the hub too (cloud only today, `cloud/src/routes/data.ts:35`).
- **Scope** trace rules to a service and an endpoint (only environment today, `evaluate.ts:45`).
- **On and off** toggle (`enabled` exists, with no control), **mute until** a time, **remind** while firing, and
  **acknowledge**.
- **Channels:** edit all 5 (the form edits only the first, `AlertForm.tsx:38`); add Microsoft Teams, Discord, and
  PagerDuty.
- **History per rule**, with a chart of the value against the line and links to the traces that broke it.
- **"Alert on this"** from a metric chart, the service page, the endpoint page, and an error group.
- Operators `>=` and `<=`.

## Phase 7 — SLOs, Apdex, and error budgets

- An SLO per service or endpoint: a latency or success target over 7 or 30 days.
- Apdex with a target time per service; on the Overview and service page.
- Error budget left, and burn rate alerts (phase 6 rules).

## Phase 8 — Saving and sharing

- **Saved views:** any page with its filters and range, named, in the sidebar. Per user; share with the team (cloud).
- **Saved searches** (`SEARCH-PLAN.md:115, 140`), the same store.
- **Dashboards:** many metric charts on one page; several metrics on one chart; filter by attribute value (only
  split today, `metrics/model.ts:18`); chart types: line, stacked bar, area, single number, table.
- **CSV export** on Errors, Logs, Database, Traces, Search, and Insights (Requests only today).
- **Share a page** (cloud), not only a trace.

## Phase 9 — Search everywhere

- The query bar with autocomplete on Requests, Traces, and Logs (`SEARCH-PLAN.md:134-136`); they use a text box now.
- Counts per kind and a time histogram on the Search page (`SEARCH-PLAN.md:137-138`).
- Search error groups, queries, and insights. Ctrl+K finds metrics, alerts, insights, and saved views.

## Phase 10 — Users

- "Users affected" on error groups, insights, and endpoints (`enduser.id` is captured, `stats/requests.ts:128`).
- A user filter on Requests, Errors, and Logs.
- A user page: that user's requests, errors, and slow pages over time.

## Phase 11 — Settings and Team

- **Hub options** for the slow query and N+1 thresholds (hard-coded today, `hub/src/api.ts:36`).
- **Edit settings in the UI** where the host can keep them: thresholds, redacted keys, and retention per project
  (hub and cloud). In-app settings stay in code, as now.
- **Team:** roles per project; API key expiry, rotate, and scopes; the audit log pages through history (the API
  supports `before`, the UI shows the newest 100, `ActivityPanels.tsx:47`), with filters and export.

## Phase 12 — AI tools (MCP)

- Tools that return page models: services, the service page, endpoints, error groups, database, insights, and
  alerts. One `get_page` tool over `PAGES` covers most of them.
- The hub's `find_*` tools read the store, not the newest 2000 traces in memory (`hub/src/mcp.ts:8`).
- .NET gets `list_projects` where it applies. (Done as: the hub, which holds several projects, answers it; the .NET
  add-on serves one app, so it does not apply there.)

## Phase 13 — SDK coverage

- **Both add-ons:** Redis, MongoDB, Elasticsearch.
- **Node:** NestJS requests, GraphQL, BullMQ and SQS, `node:http` and axios outside fetch.
- **Browser:** a plain JavaScript package, then Vue, Angular, and Svelte (React only today).
- **Other languages:** Python, Java, and Go send OTLP to a hub today. Write a guide per language first; SDKs later.

## Phase 14 — Browser source maps

Minified React stacks are unreadable, and front-end teams will not switch without this.

- **Upload:** an API and CLI (`npx @wizeworks/lens-cli sourcemaps upload`) that store maps per release (phase 5
  versions). Plugins for Vite, webpack, and Next.js that upload at build time.
- **Hub and in-app:** read maps from the dev server or the build folder, so local stacks are readable with no upload.
- **Resolve** browser stack frames on read, with file, line, function, and a few lines of source. Keep the raw frame.
- **Group** browser errors by the resolved frame, not the minified one (the group key changes, facts change).

## Phase 15 — Uptime checks

The cheapest gap that buyers call a must.

- **HTTP checks:** URL, method, headers, expected status and body text, interval (1 to 60 minutes), timeout.
- Run from the cloud and from the hub. Results go in as spans of a `wizelens-uptime` service, so pages, search, and
  phase 6 alerts work on them with no new path.
- **Uptime page:** status per check, response time chart, uptime % over 24 hours, 7 days, and 30 days, incidents.
- **TLS certificate expiry** warning. A public status page per project (cloud) comes after.

## Phase 16 — Logs as a product

Today the add-ons keep only lines written inside a request.

- **All logs:** lines outside a request (startup, background jobs, timers) are kept too, with service and level.
  Sampling and a level floor per service keep the volume in check.
- **Patterns:** group similar lines (numbers and ids masked) with a count and a trend; click a pattern to filter.
- **Log alerts:** count of a search over a window (phase 6 rules).
- **Log metrics:** a chart from a saved search (phase 8 dashboards).
- **Retention per project for logs**, apart from traces.

## Phase 17 — Anomaly detection and problems

This answers Dynatrace Davis, Datadog Watchdog, and New Relic Applied Intelligence. No built-in AI: plain statistics.

- **Baselines** per service and endpoint for error rate, p95, and traffic, by hour of the week, from the rollups.
- **Anomaly alerts:** "above normal" as a phase 6 rule type, next to fixed thresholds.
- **Problems:** anomalies that start close together on services joined in the call map become one problem card. The
  card names a suspected cause: a new release (phase 5), a new error group, a slow query, or a downstream service.
- A Problems page and a problem link in alert notices. MCP gets `list_problems` (phase 12).

## Phase 18 — Hosts and Kubernetes

Infrastructure is Datadog's largest product. APM is sold on top of it.

- **Recipe:** an OpenTelemetry Collector config (hostmetrics, kubeletstats, k8s_cluster, k8sattributes) and a Helm
  chart that sends to the hub or cloud. No WizeLens agent.
- **Hosts page:** CPU, memory, disk, and network per host, with the services on each host.
- **Kubernetes page:** cluster, node, workload, and pod, with restarts, OOM kills, and pending pods.
- **Trace links:** a span with `k8s.pod.name` links to its pod and node, and the service page shows its pods.

## Phase 19 — Install with no code change

Platform teams must be able to turn WizeLens on without touching app code. This counters Dynatrace OneAgent.

- **Node:** `node --import @wizeworks/lens-node/auto`, set by `NODE_OPTIONS` and driven by env vars.
- **.NET:** a startup hook package (`DOTNET_STARTUP_HOOKS`) that adds WizeLens with no `AddWizeLens()` call.
- **Kubernetes:** a mutating webhook (or Helm values) that adds the hook and env vars to labeled pods.
- The current code install stays and wins when both are present.

## Phase 20 — Java, Python, and Go

Most Datadog and Dynatrace estates run Java. Phase 13 writes the guides; this phase makes them first-class.

- Start from the OpenTelemetry auto-instrumentation agents, with WizeLens defaults (env vars, sampling, redaction).
- The insight rules (N+1, duplicate and slow queries, DB wait) run on generic OTel spans, so every language gets them.
- Then thin SDKs where the agents miss detail: SQL parameters, request bodies, and log capture.

