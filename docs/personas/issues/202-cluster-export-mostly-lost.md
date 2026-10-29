# 202 — A cluster's data mostly never arrives: nodes "0 of 3 ready", most pods "Unknown"

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, scoring pass (cloud `#/kubernetes` on sparx's production AKS)
**Surface:** Hub and cloud OTLP metric intake; every Kubernetes screen
**Filed:** 2026-10-29
**Fixed:** 2026-10-29 (PR #124)
**Confirmed by:** P06 Ifeoma at cloud `#/kubernetes` and a node page, desktop light and dark, 02:58

## What happened

Right after the collector went on the cluster, Kubernetes said "Nodes 0 of 3 ready" on a healthy cluster, and 65 of
77 pods showed phase "Unknown". Pod phases arrived in patches: a few namespaces each minute, never all. Node
conditions and workload metrics never arrived at all. A missing value looked like a real "not ready".

## Where it lives

`js/packages/hub/src/otlp/metrics.ts`, `writesFromMetrics`: one write per OTLP resource. The `k8s_cluster`
receiver sends one resource per pod, node and workload, and the cloud saves each write with about five ClickHouse
round trips on one shared chain. A 77-pod export ran past the exporter's timeout, so only the first resources were
kept.

## Fix

The resources of one export join into one write per sender. Infrastructure senders join by project and environment;
each point already carries its pod and node. App senders join only when the whole sender matches.

## Confirmation

- 02:57, cloud `#/kubernetes`: "Nodes 3 of 3 ready", 84 pods Running; the Gone ones are old pods sparx's release replaced.
- 02:58, node `aks-user-38361330-vmss000000`: "Ready" beside the name; its pods Running.
