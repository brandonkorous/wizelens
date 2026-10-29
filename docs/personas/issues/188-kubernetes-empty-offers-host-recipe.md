# 188 — The empty Kubernetes page offers the host recipe, which sends no Kubernetes metrics

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 8 (Kubernetes, with the host collector already sending)
**Surface:** Kubernetes; Hosts (empty)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Kubernetes, 1440 light, 17:34

## What happened

With `host.yaml` already running, Kubernetes still said "Run the OpenTelemetry Collector with the WizeLens recipe
(deploy/helm/wizelens-collector or deploy/collector/host.yaml)". She had run one of the two and the page stayed empty;
it did not say which recipe fills which page.

## Where it lives

`js/packages/ui/src/pages/infra/infraParts.tsx`, `NoInfra`.

## Fix

Each page names its own recipe: Hosts the host recipe on each host, Kubernetes the collector chart in the cluster.

## Confirmation

- 17:34, Ifeoma: "No Kubernetes metrics yet. Install the WizeLens collector chart (deploy/helm/wizelens-collector) in
  the cluster, and point it at this hub or the cloud. How to set it up".
