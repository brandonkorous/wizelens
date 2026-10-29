# 207 — A pod has no link to its own traces and logs

**Status:** open
**Severity:** minor
**Found by:** P06, cloud `#/infra/kubernetes/pods/<pod>` on sparx's AKS
**Surface:** Kubernetes › pod (and node)
**Filed:** 2026-10-29
**Blocked on:** scope

## What happened

A pod page shows the pod's CPU, memory, containers and services, but nothing leads to the requests or log lines that
pod served. To see them you go to Traces or Logs and filter by service, which mixes in every other pod of that service.

## Where it lives

Search can filter by `service:` but has no field for the host or pod a span or log line came from. The search index
(Postgres and ClickHouse) has no host column, so a pod scope is not a link change: it needs the column, its fill on
ingest, and a backfill.

## Done so far

The pod page's services panel now links each service to its traces and its logs (`infraParts.tsx`, the "see" column),
so one tap reaches the service's data.

## What it needs

A `host:` search field over a new host column in both search stores, filled from the span or log's resource
(`host.name`, `k8s.pod.name`), then a "Traces from this pod" and "Logs from this pod" link on the pod and node pages.
That is a pipeline change across hub, cloud and both stores, so it waits for a decision on scope.
