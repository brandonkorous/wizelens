# WizeLens — All Projects Plan

Written 2026-10-20. The cloud dashboard reads one project at a time. This plan adds "All projects": one view of every
project a person can see in one organization. It is a single pane of glass for the org.

Decisions (2026-10-20):

1. **"All" means all projects of one organization.** An org picker sets the current org. Billing, plans, and roles
   stay per org. Nothing ever reads across two orgs.
2. **Per-project features are read across and edited per project.** Alerts, issues, SLOs, uptime, saved views, and
   shares list every project's rows with a project column. Create and edit ask for a project.
3. **Same-named services stay apart.** `api` in Project X and `api` in Project Y are two rows: "api · Project X".
4. **The org boundary lives in the data, not only in the code.** Every telemetry row carries `org_id`, and the
   database itself refuses a read that does not name one org.

The rules of `GAPS-PLAN.md` ("Rules for every phase") still hold.

## Status

| Phase | What | Size | State |
|---|---|---|---|
| A | Loose ends | S | Done |
| B | `org_id` on every telemetry row | M | Done |
| D | One scope type: one org, a list of projects | L | Done |
| C | The database enforces the org | M | Done |
| E | Data routes read many projects | L | Done |
| F | Per-project features, read across | M | Done |
| G | The dashboard: org picker and "All projects" | L | Done |
| H | MCP, docs, and the site | S | Done |

## Three locks against a cross-org read

Today one missed `project` reads every customer: `SqlScope.project` is optional, and "missing means all"
(`core/src/scale/sql/dialect.ts:29-33`, `scopeWhere` at `:142-147`). "All projects" makes a wide read normal, so a
single guard is not enough.

1. **Code.** The cloud scope type has a required `org` and a non-empty `projects` list. Building one without them
   throws. There is no "all" value on the cloud (phase D).
2. **Data.** Every row has `org_id`. Every cloud read filters `org_id = {org} AND project_id IN {projects}`. A wrong
   project list from another org then matches no rows (phase B).
3. **Database.** Reads run as a reader user under a row policy keyed on the request's org. A query without an org
   fails, it does not widen (phase C).

Project ids are random (`newId`, `repo/projects.ts:22`), and a project never moves to another org. So `org_id` is
fixed per project and safe to stamp at ingest.

## Phase A — Loose ends

1. **Hosts and Kubernetes ignore project retention.** `routes/models.ts:83` passes `project.orgId` to
   `retentionDays`, which takes a project id. They always use `config.retentionDays`.
2. **The contract is stale on access.** `docs/CONTRACT.md:1134` says a person sees every project of the org. Project
   roles can hide one (`repo/project-roles.ts:9-26`).

## Phase B — `org_id` on every telemetry row

1. **ClickHouse.** `org_id LowCardinality(String) DEFAULT ''` on every table in `ORG_TABLES` (`telemetry/ch/schema.ts`),
   added by ALTER (never an edit to a shipped CREATE). Views now run after every ALTER and select `org_id`. The sort
   keys stay: `project_id` already leads them and implies the org.
2. **Writes.** The store looks each project's org up in Postgres (`orgOf`, kept for good in `OrgCache`). Raw rows,
   metric tiers and series, facts, tombstones, rollups, histograms, and `settle_state` all carry it. A deleted
   project's queued traces leave the queue unwritten.
3. **Backfill.** `stampOrgs` (`ch/admin.ts`) runs on start and with each prune: one waited mutation per table sets
   `org_id` on rows that have none, for projects that still exist. No `FACTS_VERSION` bump, so the hub does not rebuild.
4. **Postgres telemetry** (`pg-store.ts`, the cloud without ClickHouse). Migration 23 (`db/schema-orgs.ts`) adds
   `org_id TEXT NOT NULL DEFAULT ''`, fills it from `projects`, and a `BEFORE INSERT` trigger stamps every new row, so
   the shared writers stay unchanged.
5. **Tests** (`org-stamp.test.ts`). Every row of every telemetry table has the project's org, on Postgres and
   ClickHouse. The stamp fills rows without one and leaves a deleted project's rows empty.

## Phase C — The database enforces the org

1. **ClickHouse.** On start the cloud makes a read-only user, `<writer>_reader`, whose password is an HMAC of the
   writer's, so every pod derives the same one and no new secret is needed (production, Docker, and CI users all have
   access management). One row policy per table in `ORG_TABLES`: `org_id = getSetting('SQL_wl_org')` for the reader,
   `1` for the writer (a table with policies shows nothing to users it does not name). Every read in a `TenantScope`
   goes as the reader with `SQL_wl_org` set; without the setting the read fails. Ingest, settling, retention,
   rebuild, and copy keep the writer.
2. **Postgres telemetry.** Row level security on the telemetry tables for a `wl_reader` role:
   `USING (org_id = current_setting('wl.org'))`. Scoped reads run in a transaction with `SET LOCAL ROLE wl_reader` and
   `wl.org` set. The owner (writer) is not subject to the policies.
3. **Tests.** A read without the setting fails. A read with org A returns no org B row, even with no org condition in
   its SQL.

## Phase D — One scope type: one org, a list of projects

1. `SqlScope` is `{ org?: string; projects?: readonly string[]; env?: string }`. `scopeWhere` writes `org_id = ?` for
   `org` and `project_id IN (…)` (`=` for one) for `projects`. The hub leaves both out, or names one project.
2. Same change in `MetricSqlScope` and its `scopeWhere`, and the search attribute lookup, which now matches on
   `(project_id, trace_id[, owner])`.
3. **Cloud `TenantScope`** (`telemetry/store.ts`): `{ org; projects }`, branded, built only by `tenantScope()`, which
   throws on an empty org or list. Every `TelemetryStore` read takes one; writes and upkeep keep project ids. Settling
   reads under the org its rows carry.
4. Tests (`tenant-scope.test.ts`): two projects of org A read as one scope add up; org B's project named under org A
   reads nothing, on Postgres and ClickHouse.

## Phase E — Data routes read many projects

1. **Resolve once.** `readScopeOf(ctx)` (`routes/scope.ts`): `?project=<id>` is one project; `?project=all&org=<id>`
   is every project the caller may read there (`requireOrgRead`, `auth/org-access.ts`): a person's minus hidden ones,
   a key's own; 404 when none. Traces, one trace, services, page models, metrics, hosts, Kubernetes, search, suggest,
   tags, changes, and source map resolve all use it.
2. **Same-named services stay apart** (`core/src/scale/sql/project-keys.ts`, `rollup-keys.ts`). With more than one
   project the scope carries each one's label (its name, or "name (slug)" when two share one). Rollup kinds whose key
   names a service (`svc`, `svc.ep`, `edge`, error groups, `log.s`, `log.p`, `rel`, `ep.u`, `req.svc`, every `@svc`
   kind) group by project too and come back as "api · Shop", their tops as well. Other kinds (levels, layers, routes,
   queries) add up across projects, as environments do. A labeled key, prefix, or service in a filter reads its
   project only. List and search rows say their `project` and label their services.
3. **Per-project state, merged** (`routes/scope-state.ts`): issue states and Apdex targets keyed with the labels;
   tag rules of every project (a name two use keeps the first). Retention is the longest of the projects; thresholds
   are theirs when they agree, else the cloud's.
4. **Live updates.** `api/changes` subscribes to every project of the read; cached pages drop when any of theirs
   gets data.
5. **Tests.** `all-projects.test.ts`: labeled services, totals that add up, a labeled filter, hidden projects, read
   keys, and other organizations. `tenant-scope.test.ts`: labels on Postgres and ClickHouse.

## Phase F — Per-project features, read across

1. **Org list routes** (`routes/org-lists.ts`): `GET api/orgs/:org/alerts`, `/issues`, `/slos`, `/uptime`, `/shares`,
   each held to `requireOrgRead`, each row with `projectId` and its project's label. Create, edit, and delete stay on
   `api/projects/:project/…`.
2. **Issue actions** (`POST api/orgs/:org/issues`): a labeled error group changes in its project; an insight (counted
   across projects) changes in every project the caller may write.
3. **Saved items of the whole organization** (migration 25, `routes/saved-org.ts`): `saved_items.org_id`, and
   `project_id` may be null. `api/orgs/:org/saved` lists them beside each readable project's, and changes only them.
4. **Stay per project:** settings, tag rules, source map uploads, the status page. Under All the dashboard shows a
   project list to pick from (phase G).
5. **Tests** (`org-lists.test.ts`): rows with their project, hidden projects left out, other organizations 404,
   organization saved items, and an insight change across projects.

## Phase G — The dashboard: org picker and "All projects"

1. **Current org.** `useOrgScope()` (pref `wizelens.ui.org`, in the URL as `org`). `currentProject()` returns the shown
   organization and its one project (null under All); Team, the user menu, and the usage banner read the org.
2. **The menu** (`shell/HubMenu.tsx`): Organization (with more than one), then the shown organization's projects with
   "All projects" first (with more than one). A new session, or a project that is gone, starts on All.
3. **Requests.** `data/projectScope.ts` builds the scope query (`project=all&org=…` or `project=<id>`) for every data
   hook, and `cloudResource()` the address of a per-project resource: the item's own project, else the org list.
4. **Per-project features under All.** Alerts, SLOs, uptime, issues, shares, and saved items list across projects
   with a Project column; a row's link (`alertHref`, `sloHref`, `dashboardHref`, saved items) opens its project;
   actions go to the row's project; new alerts, SLOs, and checks get a Project field (`useTargetProject`).
5. **One project only:** settings, Apdex targets, and the status page show "Pick a project" (`ui/PickProject.tsx`);
   share buttons and "Forget offline hosts" hide.
6. **Checked in a browser** on a local cloud with ClickHouse: two projects with an `api` service each show as
   "api · Admin" and "api · My app", totals add up, a service page reads its project only, a new alert lands in the
   picked project, and one project still reads as before.

## Phase H — MCP, docs, and the site

1. **MCP.** A reader with several projects reads them all together when a tool names no `project` (`McpProjects.all`,
   `routes/mcp-all.ts`): one scope with labels, alerts and tags of every project. `get_overview`, `get_timeseries`,
   `group_requests`, and `list_problems` still report one entry per project.
2. **Contract.** `docs/CONTRACT.md` has an "All projects" section (the scope, the three locks, labels, per-project
   state) and the new routes.
3. **Site.** The cloud page has an "Every project, one screen." tile with a live demo (`ProjectsArt`), and the cloud
   docs an "All projects" section.
