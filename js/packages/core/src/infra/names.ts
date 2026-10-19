// The OpenTelemetry Collector metrics and resource attributes the Hosts and Kubernetes pages read.

/** The service of points from a resource with no `service.name` but host or Kubernetes attributes (the collector's own receivers). */
export const INFRA_SERVICE = "infrastructure";

/** Resource attributes copied onto every metric point, so one host, node, or pod is one series. */
export const INFRA_RESOURCE_KEYS: readonly string[] = [
  "host.name",
  "os.type",
  "k8s.cluster.name",
  "k8s.node.name",
  "k8s.namespace.name",
  "k8s.pod.name",
  "k8s.container.name",
  "k8s.deployment.name",
  "k8s.statefulset.name",
  "k8s.daemonset.name",
  "k8s.job.name",
  "k8s.cronjob.name",
  "k8s.container.status.last_terminated_reason",
];

/** Resource attributes copied onto OTLP spans, so a span links to its pod and node. */
export const SPAN_RESOURCE_KEYS: readonly string[] = ["k8s.cluster.name", "k8s.node.name", "k8s.namespace.name", "k8s.pod.name", "k8s.deployment.name", "k8s.statefulset.name", "k8s.daemonset.name"];

/** hostmetrics receiver (with the resourcedetection processor for host.name). */
export const HOST = {
  cpuUtil: "system.cpu.utilization",
  cpuTime: "system.cpu.time",
  cpuCount: "system.cpu.logical.count",
  load1: "system.cpu.load_average.1m",
  memUtil: "system.memory.utilization",
  memUsage: "system.memory.usage",
  fsUtil: "system.filesystem.utilization",
  fsUsage: "system.filesystem.usage",
  diskIo: "system.disk.io",
  netIo: "system.network.io",
} as const;

/** kubeletstats (usage) and k8s_cluster (state) receivers. Older kubeletstats names are read as fallbacks. */
export const KUBE = {
  nodeCpu: ["k8s.node.cpu.usage", "k8s.node.cpu.utilization"],
  nodeMem: "k8s.node.memory.working_set",
  nodeReady: "k8s.node.condition_ready",
  nodeCpuAlloc: "k8s.node.allocatable_cpu",
  nodeMemAlloc: "k8s.node.allocatable_memory",
  nodeNet: "k8s.node.network.io",
  podCpu: ["k8s.pod.cpu.usage", "k8s.pod.cpu.utilization"],
  podMem: "k8s.pod.memory.working_set",
  podNet: "k8s.pod.network.io",
  podPhase: "k8s.pod.phase",
  restarts: "k8s.container.restarts",
  ready: "k8s.container.ready",
  memLimit: "k8s.container.memory_limit",
  cpuLimit: "k8s.container.cpu_limit",
  deployDesired: "k8s.deployment.desired",
  deployAvailable: "k8s.deployment.available",
  stsDesired: "k8s.statefulset.desired_pods",
  stsReady: "k8s.statefulset.ready_pods",
  dsDesired: "k8s.daemonset.desired_scheduled_nodes",
  dsReady: "k8s.daemonset.ready_nodes",
  jobDesired: "k8s.job.desired_successful_pods",
  jobDone: "k8s.job.successful_pods",
} as const;

const flat = (o: Record<string, string | readonly string[]>) => Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : [...v]));

/** Every metric name the infrastructure pages read. */
export const INFRA_METRICS: readonly string[] = [...flat(HOST), ...flat(KUBE)];

/** Metrics drawn as lines on a host, node, or pod page. */
export const CHART_METRICS: readonly string[] = [HOST.cpuUtil, HOST.cpuTime, HOST.memUsage, HOST.memUtil, HOST.diskIo, HOST.netIo, ...KUBE.nodeCpu, KUBE.nodeMem, KUBE.nodeNet, ...KUBE.podCpu, KUBE.podMem, KUBE.podNet];

/** k8s.pod.phase values. */
export const POD_PHASES = ["", "Pending", "Running", "Succeeded", "Failed", "Unknown"] as const;

export const OOM_REASON = "OOMKilled";
