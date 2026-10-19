import { describe, expect, it } from "vitest";
import { INFRA_REGISTRY, infraScenario } from "../testing/infra-scenario.js";
import { METRIC_NOW } from "../testing/metric-scenario.js";
import { infraDataOf } from "./data.js";
import { hostsModelOf } from "./hosts.js";
import { kubeModelOf } from "./kube.js";

const points = infraScenario("1h");
const hosts = (params: Record<string, string> = {}) => hostsModelOf(infraDataOf(points, "1h", METRIC_NOW, params), INFRA_REGISTRY);
const kube = (params: Record<string, string> = {}) => kubeModelOf(infraDataOf(points, "1h", METRIC_NOW, params), INFRA_REGISTRY);

describe("hosts page", () => {
  it("lists each host with CPU, memory, disk, and network, from utilization or cpu time", () => {
    const m = hosts();
    expect(m.hosts.map((h) => h.name)).toEqual(["node-a", "node-b"]);
    for (const h of m.hosts) {
      expect(h.cpu).toBeGreaterThan(0);
      expect(h.cpu).toBeLessThan(1);
      expect(h.cores).toBe(2);
      expect(h.disk).toBeCloseTo(6 / 9, 6);
      expect(h.diskTotal).toBe(9.1e10);
      expect(h.memTotal).toBeGreaterThan(h.memUsed!);
      expect(h.netIn).toBeGreaterThan(0);
      expect(h.node).toBe(true);
      expect(h.os).toBe("linux");
    }
    expect(m.summary.hosts).toBe(2);
  });

  it("finds services on a host by host name, by node, and by pods on the node", () => {
    const m = hosts();
    expect(m.hosts.find((h) => h.name === "node-a")!.services).toEqual(["api", "billing"]);
    expect(m.hosts.find((h) => h.name === "node-b")!.services).toEqual(["api", "orders"]);
    expect(hosts({ q: "billing" }).hosts.map((h) => h.name)).toEqual(["node-a"]);
  });

  it("draws the chosen host's lines and lists its file systems and pods", () => {
    const d = hosts({ host: "node-b" }).selected!;
    expect(d.row.name).toBe("node-b");
    expect(d.buckets).toHaveLength(60);
    for (const line of [d.cpu, d.memory, d.netIn, d.netOut, d.diskRead, d.diskWrite]) expect(line.filter((v) => v !== null).length).toBeGreaterThan(40);
    expect(d.fileSystems.map((f) => f.mount)).toEqual(["/"]);
    expect(d.pods).toEqual(["shop/api-7d9f-def", "shop/db-0"]);
    expect(hosts().selected).toBeNull();
  });
});

describe("kubernetes page", () => {
  it("counts nodes, pods, pending pods, restarts, and out-of-memory kills", () => {
    const m = kube();
    expect(m.clusters).toEqual(["prod"]);
    expect(m.summary).toEqual({ nodes: 2, readyNodes: 2, pods: 4, running: 3, pending: 1, failed: 0, restartsNew: 1, oomKills: 1, workloads: 3 });
    const api = m.pods.find((p) => p.name === "api-7d9f-abc")!;
    expect(api).toMatchObject({ namespace: "shop", node: "node-a", workload: "Deployment/api", phase: "Running", restarts: 2, restartsNew: 1, oomKills: 1, services: ["api"], memLimit: 5e8 });
    expect(m.nodes.map((n) => [n.name, n.pods, n.ready, n.host])).toEqual([["node-a", 1, true, true], ["node-b", 2, true, true]]);
    expect(m.pods.find((p) => p.name === "api-7d9f-old")!.phase).toBe("Gone");
  });

  it("lists workloads with desired and ready counts from k8s_cluster", () => {
    const w = kube().workloads.map((x) => [x.key, x.desired, x.ready, x.pods, x.pending]);
    expect(w).toEqual([["shop/Deployment/api", 2, 2, 2, 0], ["shop/Deployment/worker", 1, 0, 1, 1], ["shop/StatefulSet/db", 1, 1, 1, 0]]);
  });

  it("filters pods by namespace, workload, service, and name", () => {
    expect(kube({ workload: "shop/Deployment/api" }).pods).toHaveLength(3);
    expect(kube({ service: "orders" }).pods.map((p) => p.name)).toEqual(["db-0"]);
    expect(kube({ ns: "other" }).pods).toEqual([]);
    expect(kube({ q: "worker" }).pods.map((p) => p.name)).toEqual(["worker-5c4-xyz"]);
    expect(kube({ cluster: "staging" }).pods).toEqual([]);
  });

  it("opens a node and a pod with their lines, containers, and services", () => {
    const node = kube({ node: "node-b" }).node!;
    expect(node.pods.map((p) => p.name)).toEqual(["api-7d9f-def", "db-0"]);
    expect(node.services.map((s) => s.service)).toEqual(["api", "orders"]);
    expect(node.cpu.filter((v) => v !== null).length).toBeGreaterThan(40);
    const pod = kube({ pod: "shop/api-7d9f-abc" }).pod!;
    expect(pod.containers).toEqual([{ name: "app", ready: true, restarts: 2, restartsNew: 1, lastExit: "OOMKilled", memLimit: 5e8, cpuLimit: null }]);
    expect(pod.netIn.filter((v) => v !== null).length).toBeGreaterThan(40);
    expect(kube({ pod: "nope/nope" }).pod).toBeNull();
  });
});
