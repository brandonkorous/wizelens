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
| E | Data routes read many projects | L | |
| F | Per-project features, read across | M | |
| G | The dashboard: org picker and "All projects" | L | |
| H | MCP, docs, and the site | S | |

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

1. **Resolve once.** `scopeOf(ctx)` replaces `projectOf` (`routes/data.ts:18-22`). `?project=<id>` gives that project
   and its org. `?project=all&org=<id>` gives `joinScope` of that org (`auth/join-scope.ts:11-17`): hidden projects
   left out, keys and apps held to their own projects. Every data route uses it: traces, services, models, metrics,
   hosts, Kubernetes, search, suggest, tags, changes.
2. **Rows say their project.** List rows, services, rollup rows, and search hits carry `project`. Rollups group by
   `project_id, key` when the scope has more than one project, so same-named services and endpoints stay apart.
   Totals and charts still sum.
3. **Per-project rules, applied per row.** Apdex targets and issue states key on `project|key`. Tag rules: `tag:x`
   matches in the projects that define `x`. The range check uses the longest retention of the scope; older rows are
   gone by TTL. `slowQueryMs` is already in the facts; read-time uses stay per row.
4. **Traces.** A trace id in two projects lists once, under the project of its root span. The trace page opens with
   `joinedTrace` over the scope (`repo/trace-join.ts`).
5. **Live updates.** `api/changes` subscribes to every project of the scope.
6. **Leak suite.** Two orgs with the same service names, endpoints, and trace ids. Every data route under All for
   org A returns no org B row, on Postgres and ClickHouse. A hidden project never shows.

## Phase F — Per-project features, read across

1. **Org list routes.** `GET api/orgs/:org/alerts`, `/issues`, `/slos`, `/uptime`, `/saved`, `/shares`, each held to
   `joinScope` and each row with its project. Create, edit, and delete stay on `api/projects/:project/…`.
2. **Issue actions** (resolve, ignore, assign) act on the row's project.
3. **Saved views** may save the All scope: `saved_items` gets `org_id`, and `project_id` may be null for an org view.
4. **Stay per project:** settings, tag rules, source map uploads, the status page. Under All they show a project list
   to pick from.

## Phase G — The dashboard: org picker and "All projects"

1. **Current org.** `useOrgScope()` (pref `wizelens.ui.org`, in the URL as `org`). `currentProject()`
   (`data/account.ts:146-153`) becomes `currentOrg()` for Team, UserMenu, and UsageBanner.
2. **Org picker** in the top bar when the person has more than one org. The project menu lists only that org.
3. **"All projects"** first in `HubMenu` on the cloud too (`all` no longer `!projects`, `shell/HubMenu.tsx:79`).
   `pickProject()` (`data/account.ts:63-66`) no longer forces the first project. A new session starts on All.
4. **Requests.** One place builds the scope query (`project=all&org=…` or `project=<id>`), and every data hook uses it.
   Hooks gated on `!!project` (`saved`, `issues`, `uptime`, alerts, SLOs, shares) read the org list routes under All.
5. **Project on rows** under All: services ("api · Project X"), traces, errors, logs, search, alerts, issues, uptime.
   A click on a project chip narrows to that project.
6. **Create forms** (alert, SLO, uptime check, share) get a project field under All.
7. **Settings pages** under All show "Pick a project" with the org's projects.

## Phase H — MCP, docs, and the site

1. **MCP.** The cloud MCP reads the multi-project scope directly. `search`, `get_errors`, `list_traces`, and the
   others take no `project` and cover the reader's projects, like `get_overview` does today
   (`node/src/mcp-projects.ts:19-29` stops throwing).
2. **Contract.** `docs/CONTRACT.md` "Traces across projects" (`:1128-1139`) and the `?project=` routes (`:945`) cover
   `project=all`, the org list routes, and the three locks.
3. **Site.** A docs section and a product page line for the single pane of glass, with a live demo per
   the marketing site style.
