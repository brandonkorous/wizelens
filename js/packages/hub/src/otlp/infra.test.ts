import { afterEach, describe, expect, it } from "vitest";
import type { HostsModel, KubeModel } from "@wizeworks/lens-core";
import type { Hub } from "../hub.js";
import { hostmetricsExports, kubeExport, podSpanExport } from "../test/collector.js";
import { post, startHub } from "../test/helpers.js";
import { encodeMetrics } from "./proto.js";

const NOW = 1_800_000_000_000;
const TRACE = "0af7651916cd43dd8448eb211c80319c";
let hub: Hub;
afterEach(() => hub?.close());

const get = async <T>(url: string, path: string) => (await (await fetch(`${url}/_wizelens/${path}`)).json()) as T;

async function fed(proto = false) {
  let url: string;
  ({ hub, url } = await startHub({ now: () => NOW }));
  for (const body of hostmetricsExports(NOW - 5_000)) {
    const res = proto
      ? await fetch(`${url}/v1/metrics`, { method: "POST", headers: { "Content-Type": "application/x-protobuf" }, body: encodeMetrics(body) })
      : await post(`${url}/v1/metrics`, body);
    expect(res.status).toBe(200);
  }
  for (const [i, t] of [NOW - 70_000, NOW - 10_000].entries()) expect((await post(`${url}/v1/metrics`, kubeExport(t, 1e6 * (i + 1)))).status).toBe(200);
  expect((await post(`${url}/v1/traces`, podSpanExport(NOW - 9_000, TRACE))).status).toBe(200);
  return url;
}

describe("OpenTelemetry Collector metrics", () => {
  for (const proto of [false, true]) {
    it(`serve the Hosts page from recorded hostmetrics exports (${proto ? "protobuf" : "JSON"})`, async () => {
      const url = await fed(proto);
      const m = await get<HostsModel>(url, "api/models/hosts?range=1h&host=docker-host");
      expect(m.hosts.map((h) => h.name)).toEqual(["docker-host"]);
      const h = m.hosts[0]!;
      expect(h).toMatchObject({ os: "linux", cores: 32 });
      for (const v of [h.cpu, h.mem, h.disk, h.memUsed, h.memTotal, h.diskTotal, h.load1]) expect(v).toBeGreaterThan(0);
      expect(h.netIn).not.toBeNull();
      expect(m.selected!.cpu.some((v) => v !== null)).toBe(true);
      expect(m.selected!.fileSystems[0]).toMatchObject({ mount: "/etc/hostname", type: "ext4" });
    });
  }

  it("serve the Kubernetes page: pods, restarts, OOM kills, pending pods, and the services in each pod", async () => {
    const url = await fed();
    const m = await get<KubeModel>(url, "api/models/kubernetes?range=1h&pod=shop/api-6d8f9-x2x8z");
    expect(m.clusters).toEqual(["kind"]);
    expect(m.summary).toMatchObject({ nodes: 1, readyNodes: 1, pods: 2, running: 1, pending: 1, oomKills: 1 });
    expect(m.pod!.row).toMatchObject({ node: "kind-worker", workload: "Deployment/api", restarts: 3, services: ["api"], memLimit: 2.68e8 });
    expect(m.pod!.containers[0]).toMatchObject({ name: "api", lastExit: "OOMKilled", ready: true });
    expect(m.pod!.netIn.some((v) => v !== null)).toBe(true);
    expect(m.workloads).toEqual([expect.objectContaining({ key: "shop/Deployment/api", desired: 2, ready: 1, pods: 2, pending: 1 })]);
    const svc = await get<KubeModel>(url, "api/models/kubernetes?range=1h&service=api");
    expect(svc.pods.map((p) => p.name)).toEqual(["api-6d8f9-x2x8z"]);
  });

  it("puts the pod and node on OTLP spans, keeps the collector out of the registry, and records where a service runs", async () => {
    const url = await fed();
    const trace = await get<{ spans: { attributes: Record<string, unknown> }[] }>(url, `api/traces/${TRACE}`);
    expect(trace.spans[0]!.attributes).toMatchObject({ "k8s.pod.name": "api-6d8f9-x2x8z", "k8s.node.name": "kind-worker", "k8s.namespace.name": "shop", "url.path": "/orders" });
    expect(trace.spans[0]!.attributes["k8s.pod.uid"]).toBeUndefined();
    const reg = await get<{ services: { service: string; k8s?: unknown }[] }>(url, "api/services");
    expect(reg.services).toEqual([expect.objectContaining({ service: "api", k8s: { cluster: "kind", namespace: "shop", pod: "api-6d8f9-x2x8z", node: "kind-worker" } })]);
    const info = await get<{ capabilities: string[] }>(url, "api/info");
    expect(info.capabilities).toContain("infra");
  });
});
