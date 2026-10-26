# WizeLens — Table Pagination Plan

Drafted 2026-10-25. Rule: **every table that can show more than 10 rows has a pager.** Lists get long, so no table may
show an unbounded list, a silent top-N cut, or a "View all" that dumps 200 rows.

## How pagination works today (the pattern to match)

Six tables already page. All six do it the same way:

- The pager is `Pager` from `js/packages/ui/src/ui/Controls.tsx`: "1–15 of 230 requests", page buttons, and a
  "15 / 30 / 50 / 100 per page" menu.
- It sits inside the table's `Panel`, right under the `Table`.
- Page and size live in the URL: `?page=2&size=30`. `onPage` calls `setQuery({ page })`; `onPageSize` calls
  `setQuery({ size, page: null })`. A filter change resets `page: null`.
- The **server** does the paging. The core model reads `pageParams(params, DEFAULT)` (`core/src/models/input.ts`),
  sends `page: { page, size }` on a `listNeed`, or `order: { limit, offset }` on a `groupNeed`, and returns the page
  rows plus a `total`.

| Page | Table | File | Default size |
|---|---|---|---|
| Requests | Requests | `ui/src/pages/requests/RequestsTable.tsx` | 15 |
| Logs | Log lines | `ui/src/pages/logs/LogsPage.tsx` | 30 |
| Errors | Exception groups | `ui/src/pages/errors/ErrorTables.tsx` | 15 |
| Database | Query shapes | `ui/src/pages/database/DbTables.tsx` | 15 |
| Traces | Recent traces | `ui/src/pages/traces/RecentTraces.tsx` | 15 |
| Users | Users | `ui/src/pages/users/UsersPage.tsx` | 25 |

Small differences to even out: Traces shows the pager only when `total > size`; the others show it when `total > 0`.

## What is missing

About 70 tables have no pager. They fall in three groups.

- **A. Whole list in the browser** (settings, config, infra, trace detail). The page already has every row. These get
  a pager in the browser, on the same `Pager`, with the same URL params.
- **B. Cut short by the server** (telemetry). The model sends only the top 10–200 rows. Rows past the cut are lost.
  These move to real server paging, like the six above.
- **C. Other "more" buttons.** "View all / Show top N" toggles, "Load older", and "Show more". These change to the pager.

### A. Whole list in the browser — page in the browser

| Page | Table | File |
|---|---|---|
| Account | Connected apps | `pages/account/AppsPanel.tsx` |
| Account | Digest per project | `pages/account/NotificationsPanel.tsx` |
| Account | Passkeys | `pages/account/PasskeysPanel.tsx` |
| Account | Sessions | `pages/account/SessionsPanel.tsx` |
| Alerts | Alert rules | `pages/alerts/AlertsBulk.tsx` |
| Connect | Keys (sending and AI read) | `pages/connect/KeysPanel.tsx` |
| Connect | Add-on options (21 rows) | `pages/connect/OptionsReference.tsx` |
| Connect | Rotated keys result (cut at 100) | `pages/connect/RotateKeys.tsx` |
| Dashboards | Dashboards | `pages/dashboards/DashboardsPage.tsx` |
| Dashboards | Table panel | `pages/dashboards/PanelView.tsx` |
| Errors | Errors by service | `pages/errors/ErrorTables.tsx` |
| Infra | Hosts | `pages/infra/HostsPage.tsx` |
| Infra | File systems | `pages/infra/HostDetail.tsx` |
| Infra | Services on hosts | `pages/infra/infraParts.tsx` |
| Infra | Containers | `pages/infra/KubeDetail.tsx` |
| Infra | Nodes, workloads, pods | `pages/infra/KubeTables.tsx` |
| Organization | Import preview (cut at 100) | `pages/organization/ImportPick.tsx` |
| Organization | Import result (cut at 100) | `pages/organization/ImportResult.tsx` |
| Organization | Projects | `pages/organization/ProjectsPanel.tsx` |
| Organization | Data retention (raw `<table>`) | `pages/organization/RetentionSection.tsx` |
| Organization | Tags, built-in tags | `pages/organization/TagsSettings.tsx` |
| People | Project access | `pages/people/AccessSection.tsx`, `pages/people/ProjectAccess.tsx` |
| People | Invite many preview | `pages/people/InviteMany.tsx` |
| People | Invites | `pages/people/InvitesPanel.tsx` |
| People | Members | `pages/people/MembersPanel.tsx` |
| People | SCIM tokens | `pages/people/ScimSection.tsx` |
| People | Shared links | `pages/people/SharesSection.tsx` |
| Problems | Anomalies | `pages/problems/ProblemDetail.tsx` |
| Query | Services, endpoints | `pages/database/QueryPage.tsx` |
| Services | Every service | `pages/services/serviceParts.tsx` |
| Services | Registry, registry hosts | `pages/services/RegistryPanel.tsx`, `pages/services/RegistryHosts.tsx` |
| Services | Callers / callees | `pages/services/ServiceTables.tsx` |
| SLOs | SLOs | `pages/slos/SlosPage.tsx` |
| Trace | HTTP spans (raw `<table>`) | `pages/trace/HttpTab.tsx` |
| Trace | Logs, errors (raw `<table>`) | `pages/trace/LogsErrorsTabs.tsx` |
| Trace | Messages (raw `<table>`) | `pages/trace/MessagesTab.tsx` |
| Trace compare | Self time per service | `pages/trace/TraceCompare.tsx` |
| Uptime | Checks | `pages/uptime/UptimeTable.tsx` |
| Uptime | Incidents | `pages/uptime/IncidentsPanel.tsx` |
| Uptime | Import preview | `pages/uptime/ImportChecks.tsx` |

### B. Cut short by the server — move to server paging

| Page | Table | File (UI → model) | Cut today |
|---|---|---|---|
| Alerts | Fired events | `pages/alerts/AlertsPage.tsx` → hub `alerts/api.ts`, cloud `routes/alerts.ts` | 100 |
| Alert rule | Events | `pages/alerts/AlertRulePage.tsx` → same | 100 |
| Database | Table hotspots | `pages/database/DbTables.tsx` → `models/database.ts` | 200 + toggle |
| Error group | Newest occurrences | `pages/errors/ErrorGroupPage.tsx` → `models/error-page.ts` | 50 |
| Query | Traces | `pages/database/QueryPage.tsx` → `models/query-page.ts` | sampled ids |
| Endpoint | Queries, calls, errors | `pages/services/EndpointPage.tsx` → `models/endpoint-page.ts` | 50 each |
| Service | Errors | `pages/services/ServiceOwned.tsx` → `models/service-page.ts` | 50 + toggle |
| Service | Endpoints | `pages/services/ServiceTables.tsx` → `models/service-page.ts` | 200 + toggle |
| Rendering | Routes, components | `pages/rendering/RenderTables.tsx` → `models/rendering.ts` | 200 + toggle |
| Route | Page loads | `pages/rendering/RoutePage.tsx` → `models/route-page.ts` | sampled ids |
| Insights | Insight groups | `pages/insights/InsightList.tsx` → `models/insights.ts` | 200 |
| Security | Finding groups | `pages/security/SecurityList.tsx` → `models/security.ts` | 200 |
| Logs | Patterns | `pages/logs/LogPatterns.tsx` → `models/log-patterns.ts` | 50 |
| User | Errors, recent requests | `pages/users/UserPage.tsx` → `models/users.ts` | 50, 25 |
| Traces | Critical path spans | `pages/traces/TraceSidePanels.tsx` → `models/traces.ts` | 25 + toggle |

### C. Other "more" buttons — change to the pager

| Page | Today | File |
|---|---|---|
| Audit log | "Load older" (cursor) | `pages/people/AuditLog.tsx` → cloud audit route |
| Search | "Show more" (cursor, no total) | `pages/search/SearchPage.tsx` → `core/src/search/run.ts` |
| Database, Service, Rendering | "View all N / Show top N" toggles | `DbTables.tsx`, `ServiceTables.tsx`, `ServiceOwned.tsx`, `RenderTables.tsx` |

### No change: 10 rows or fewer by design

These are previews with a "View all" link to a paged page. They stay as they are.

Overview recent requests (5), services (5), new errors (5); service slowest requests (10) and logs (10); endpoint
slowest requests (10); user slowest requests (10); service versions (10); traces bottlenecks (8); trace compare
numbers (fixed rows); service detail endpoints (10, the side panel on Services). Key-value detail tables (span attributes, `KeyValues`) are not lists and stay as they are.

## Shared parts (phase 0)

1. **`useTablePaging(paging)` and `urlPaging(key)`** in `ui/src/ui/paging.ts`: the page and size from the URL (or held
   in the table), and the `Pager` handlers. Two tables on one page use two keys, for example `ep` and `err`.
2. **`Table` gets an optional `paging` prop** (`{ key, noun, size? }`). It sorts **all** rows first, then slices the
   page, then draws `Pager` under the table. A sort click goes back to page 1. A page past the end clamps to the last
   page. Group A tables add one prop and nothing else.
3. **Raw `<table>` files** (trace tabs, retention, service detail, recent traces) use the same hook and `Pager`.
4. **One rule for when the pager shows**: when the rows are more than the smallest page size (15). Small lists stay clean.
5. **Server paging helper** in core: `pageParams` takes the key prefix too, so a model can page two lists on one page.
6. Tests: `Table` paging (sort then slice, clamp, reset), `usePaging` keys, `pageParams` with a prefix.

## Phases

One commit per phase, one PR at the end. Each phase passes tests, lint, and typecheck through the agent queue.

| Phase | Work |
|---|---|
| 0 | Shared parts above, with tests. The six paged tables move to the shared hook (no visible change). |
| 1 | Group A, settings: Account, Connect, Organization, People, Alerts rules, Dashboards, SLOs, Uptime, imports. |
| 2 | Group A, telemetry and infra: Errors by service, Infra, Services, Query, Problems, Trace tabs, Trace compare. |
| 3 | Group B, core models: page params and totals for each list, in the hub and cloud executors. Speed under 1 s. |
| 4 | Group B, UI: each table reads the new model fields and shows `Pager`. Toggles in group C go. |
| 5 | Alert events (hub and cloud APIs: `offset` + `count`), audit log (`offset` + `count`), search (see open question). |
| 6 | Check every page in the browser on the Piggles test bed. CHANGELOG entry. Open the PR. |

## Decisions (2026-10-25)

1. Search gets a "Previous / Next" pager that shows "1–50 of 230+" and counts the pages it has loaded.
2. The pager shows from 16 rows (the smallest size is 15). The same rule holds for every table, old and new.
3. URL keys: a table paged in the browser keeps `<key>.page` and `<key>.size` (models never see them); a second
   server-paged list on a page keeps `<key>page` and `<key>size`; the main list keeps `page` and `size`.
4. Dialogs (import previews, rotate keys) hold the page in the table, not in the URL.
