---
title: Hosts and Kubernetes
description: Send host and Kubernetes metrics with the OpenTelemetry Collector, and see hosts, nodes, workloads, and pods with restarts and OOM kills.
---

WizeLens has no agent of its own. The standard OpenTelemetry Collector (the `contrib` build) reads your hosts and your
cluster and sends OTLP to a [hub](/docs/hub/) or to [WizeLens Cloud](/docs/cloud/). The recipe is in the repository:
a Helm chart for Kubernetes, and one config file for a plain host.

## Kubernetes

The chart is `oci://ghcr.io/wizeworksllc/charts/wizelens-collector`, published with each release (source:
[`deploy/helm/wizelens-collector`](https://github.com/wizeworksllc/wizelens/tree/main/deploy/helm/wizelens-collector)).
It runs two collectors:

| Collector | Runs as | Reads |
| --- | --- | --- |
| Agent | DaemonSet, one per node | Node, pod, and container usage from the kubelet (`kubeletstats`), the node's own CPU, memory, disks, and network (`hostmetrics`), and OTLP from apps on that node |
| Cluster | Deployment, one replica | Pod phases, restarts, last exit reasons, node conditions, and workload desired and ready counts (`k8s_cluster`) |

Both add pod, namespace, node, and workload names (`k8sattributes`), and send to one endpoint.

```bash
helm install wizelens-collector oci://ghcr.io/wizeworksllc/charts/wizelens-collector \
  --namespace wizelens --create-namespace \
  --set endpoint=https://app.wizelens.com \
  --set token=wl_ik_... \
  --set clusterName=prod
```

For a hub, set `endpoint` to its address (for example `http://wizelens-hub.wizelens:5960`) and `token` to the hub's
`--token`, or leave it empty when the hub has none.

| Value | What it does |
| --- | --- |
| `endpoint` | Where to send. The collector adds `/v1/metrics`, `/v1/traces`, and `/v1/logs`. |
| `token` | A cloud ingest key, or the hub's token. |
| `existingSecret.name`, `existingSecret.key` | Read the token from a Secret you made instead. The key defaults to `token`. |
| `clusterName` | Shown as the cluster on every node, pod, and workload. Set it when one project has several clusters. |
| `environment` | `deployment.environment.name` for everything the collectors send, for the environment menu. |
| `project` | `wizelens.project`, for a hub that holds several projects. The cloud takes the project from the key. |
| `agent.enabled` | Run the agent DaemonSet. On by default. |
| `cluster.enabled` | Run the cluster collector. On by default. |
| `otlpService.enabled` | The Service in front of the agents that takes OTLP from your apps. On by default. |
| `agent.hostMetrics` | The node's own disks and network for the Hosts page. On by default. |
| `agent.collectionInterval`, `cluster.collectionInterval` | How often to read. Default `30s`. |
| `agent.kubeletUseNodeIp` | Reach the kubelet by node address, for clusters where node names do not resolve. |
| `agent.kubeletInsecureSkipVerify` | Accept the kubelet's self-signed serving certificate. On by default. |
| `agent.memoryLimitMib`, `cluster.memoryLimitMib` | The collector refuses data above this. Keep it under the memory limit. |

The collectors only read: the ClusterRole allows `get`, `list`, and `watch`, and the kubelet's `nodes/stats`.

### Spans that know their pod

Point your apps at the node's agent instead of straight at WizeLens:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://wizelens-collector-agent.wizelens:4318
```

The Service is named after the release: with `helm install wizelens-collector` it is `wizelens-collector-agent`, and
with another release name it is `<release>-wizelens-collector-agent`. It keeps traffic on the node, so the agent knows
which pod sent each span. The span then carries `k8s.pod.name`, `k8s.node.name`, and `k8s.namespace.name`, and the trace
page links to that pod and node. WizeLens add-ons that send straight to a hub or the cloud still show their pods: inside
Kubernetes their host name is the pod's name.

## A plain host

[`deploy/collector/host.yaml`](https://github.com/wizeworksllc/wizelens/blob/main/deploy/collector/host.yaml) reads
one machine and takes OTLP from apps on it. With Docker:

```bash
docker run -d --name wizelens-collector -v /:/hostfs:ro -v $PWD/host.yaml:/etc/otelcol-contrib/config.yaml \
  -e WIZELENS_ENDPOINT=https://app.wizelens.com -e WIZELENS_TOKEN=wl_ik_... \
  -e HOST_ROOT=/hostfs -e OTEL_RESOURCE_ATTRIBUTES=host.name=$(hostname) \
  -p 4317:4317 -p 4318:4318 otel/opentelemetry-collector-contrib:0.137.0
```

Without Docker, run `otelcol-contrib --config host.yaml` with the same variables and no `HOST_ROOT`.

## The Hosts page

The Hosts and Kubernetes pages are on the [hub](/docs/hub/) and [WizeLens Cloud](/docs/cloud/).

Every host that sends `hostmetrics`: CPU busy, memory used, the fullest disk, network in and out, and the services that
run on it. A service runs on a host when it reports that host name, when its Kubernetes node is that host, or when its
pod runs on that node. Open a host for CPU, memory, disk, and network over time, its file systems, its services, and its
pods when it is a Kubernetes node.

## The Kubernetes page

Cards for ready nodes, pods, pending pods, and container restarts in the time range with out-of-memory kills. Below,
three lists:

- **Pods:** phase, node, CPU, memory against the limit, restarts (new ones in red), out-of-memory kills, and the
  services in the pod. A pod no longer reported for 5 minutes shows as "Gone".
- **Workloads:** Deployments, StatefulSets, DaemonSets, and Jobs with ready against desired. Open one for its pods.
- **Nodes:** Ready, CPU and memory against what can be allocated, pods, and pending pods.

Open a pod for its usage over time, its containers with restarts and how each last stopped, and its services. Open a
node for its usage, pods, and services. Filter by cluster, namespace, or name at the top.

A service's own page lists its pods, and the hosts it runs on.

## What WizeLens keeps

Collector metrics have no `service.name`, so they are filed under the service "infrastructure". They are kept like any
other metric and also show on the Metrics page. The host and Kubernetes names (`host.name`, `k8s.*`) on each resource
are kept on every point.

## Troubleshooting

- **No hosts.** Check the agent's log: `kubectl -n wizelens logs ds/wizelens-collector-agent`. A
  `401` means the ingest key is wrong.
- **Nodes but no CPU or memory.** The kubelet refused the agent. Try `agent.kubeletUseNodeIp=true`.
- **Spans without a pod.** The app sends straight to WizeLens, or through a Service without a local traffic policy.
