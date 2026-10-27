# 026 — Greta could not find how to name her environment "production"

**Status:** fixed
**Severity:** copy
**Found by:** P02 · Greta Lindqvist-Ochoa · act 2
**Surface:** Cloud › Connect › Setup steps; docs › Configuration › Environment variables
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-read Connect › Setup steps and /docs/configuration/ as Greta — both name NODE_ENV, ASPNETCORE_ENVIRONMENT and deployment.environment.name
**Blocked on:** —

## What happened

Greta's setup says environment `production`. The cloud's top bar has an environment picker, and Services lists each
service's environment (the neighbour's shows `development`). Connect's setup steps listed the hub, the key, the release
and OTLP — nothing about the environment. The Configuration page's variable table had no row for it either. The only
answer was in the code: Node reports `NODE_ENV`, .NET its host environment, OpenTelemetry senders
`deployment.environment.name`.

## What should have happened

Next to the other variables, one line saying which setting names the environment, for each kind of service.

## Why it matters

Alerts, SLOs and the environment picker split by it; a service that says `development` in production hides from a filter
set to `production`.

## Where it lives

`js/packages/ui/src/pages/connect/SetupSteps.tsx` and `site/content/docs/configuration.md`.

## The fix

Both setup step lists (cloud and hub) gain "Its environment (Node: NODE_ENV; .NET: ASPNETCORE_ENVIRONMENT; OpenTelemetry:
deployment.environment.name) · NODE_ENV=production". The docs table gains a row naming all three with their defaults.

## Confirmed by

> Connect › Setup steps, step 2 now reads "… WIZELENS_RELEASE=$GIT_SHA · Its environment (Node: NODE_ENV; .NET:
> ASPNETCORE_ENVIRONMENT; OpenTelemetry: deployment.environment.name) NODE_ENV=production · …". /docs/configuration/ has
> the row "NODE_ENV, ASPNETCORE_ENVIRONMENT, deployment.environment.name · Node, .NET, OpenTelemetry (Java, Python, Go)".

## Rating effect

Cloud › Connect › setup — Ease, scored in P02's run
