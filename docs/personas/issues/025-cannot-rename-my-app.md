# 025 — Greta could not rename "My app"

**Status:** fixed
**Severity:** major
**Found by:** P02 · Greta Lindqvist-Ochoa · act 2
**Surface:** Cloud › Organization › Projects
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 2 — Projects › My app › Rename → `kanninja-production` → the row, the top bar and the audit log ("Renamed a project · project kanninja-production · was My app") all show the new name
**Blocked on:** —

## What happened

Every new organization starts with one project called `My app`. Greta's project must be `kanninja-production`. The
project row offered Access, Clear data and Delete — no way to change the name. Her only path was a second project and
deleting the first, which also throws away its keys and alerts.

## What should have happened

Rename the project in place. Keys, data, alerts and links keep working: they use the project id.

## Why it matters

The name is how alert emails, the project switcher, people's access and the audit log tell projects apart. A team whose
only project is called "My app" either lives with it or deletes and rebuilds.

## Where it lives

`js/packages/cloud/src/routes/projects.ts` `changeProject` (took only `logRetentionDays`), and
`js/packages/ui/src/pages/organization/ProjectsPanel.tsx` (no control).

## The fix

`PATCH api/orgs/:org/projects/:project` takes `name` (1 to 100 characters, trimmed); the id and slug stay. It writes a
`project.rename` audit entry with the old and new names, shown as "Renamed a project · … · was My app". Each project row
has **Rename**, which opens the same name form as New project. Test: `team.test.ts` "renames a project, keeps its id and
slug, and logs who renamed it".

## Confirmed by

> Greta, Organization › Projects: row `My app` → Rename → "kanninja-production" → Rename. The row reads
> `kanninja-production fb8ecf9e… 0 Rename Access Clear data Delete`; the top bar reads `kanninja-production`; People &
> access › Audit log: "Greta Lindqvist-Ochoa · Renamed a project · project kanninja-production · was My app".

## Rating effect

Cloud › Organization › Projects — Ease, scored in P02's run
