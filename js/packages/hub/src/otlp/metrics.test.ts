import { afterEach, describe, expect, it } from "vitest";
import type { MetricPoint, MetricsModel } from "@wizeworks/lens-core/internal";
import type { Hub } from "../hub.js";
import { post, startHub } from "../test/helpers.js";
import { fromExponential, writesFromMetrics } from "./metrics.js";
import { encodeMetrics } from "./proto.js";

const NOW = 1_800_000_000_000;
const nanos = (minAgo: number) => String(BigInt(NOW - minAgo * 60_000) * 1_000_000n);
const resource = { attributes: [{ key: "service.name", value: { stringValue: "py-worker" } }, { key: "service.namespace", value: { stringValue: "shop" } }] };
const route = (r: string) => [{ key: "http.route", value: { stringValue: r } }];

const metrics = [
  { name: "process.memory.usage", unit: "By", gauge: { dataPoints: [{ timeUnixNano: nanos(2), asDouble: 1048576 }] } },
  {
    name: "jobs.done",
    unit: "{job}",
    sum: { aggregationTemporality: 2, isMonotonic: true, dataPoints: [5, 4].map((m, i) => ({ timeUnixNano: nanos(m), startTimeUnixNano: nanos(30), asInt: String(100 + i * 60) })) },
  },
  {
    name: "http.server.request.duration",
    unit: "s",
    histogram: { aggregationTemporality: 1, dataPoints: [{ timeUnixNano: nanos(2), count: "10", sum: 1, bucketCounts: ["2", "8", "0"], explicitBounds: [0.05, 0.5], attributes: route("/a") }] },
  },
  {
    name: "rpc.duration",
    unit: "ms",
    exponentialHistogram: { aggregationTemporality: 1, dataPoints: [{ timeUnixNano: nanos(2), count: "6", sum: 9, scale: 0, zeroCount: "1", positive: { offset: 0, bucketCounts: ["2", "3"] } }] },
  },
  { name: "legacy.latency", unit: "ms", summary: { dataPoints: [{ timeUnixNano: nanos(2), count: "4", sum: 40, quantileValues: [{ quantile: 0.5, value: 9 }] }] } },
];
const body = { resourceMetrics: [{ resource, scopeMetrics: [{ scope: { name: "app" }, metrics }] }] };

let hub: Hub;
afterEach(() => hub?.close());

async function model(url: string, q: string): Promise<MetricsModel> {
  return (await (await fetch(`${url}/_wizelens/api/models/metrics?${q}`)).json()) as MetricsModel;
}

describe("OTLP metrics", () => {
  it("converts exponential buckets to explicit ones", () => {
    expect(fromExponential({ count: 6, sum: 9, scale: 1, zeroCount: 1, negative: { bucketCounts: [1] }, positive: { offset: 2, bucketCounts: [2, 3] } })).toEqual({
      count: 6,
      sum: 9,
      min: null,
      max: null,
      bounds: [2, 2 ** 1.5, 4],
      counts: [2, 2, 3, 0],
    });
  });

});

describe("OTLP metrics over HTTP", () => {
  it("takes all five kinds as JSON and serves the metrics page", async () => {
    let url: string;
    ({ hub, url } = await startHub({ now: () => NOW }));
    const res = await post(`${url}/v1/metrics`, body);
    expect(res.status).toBe(200);
    const m = await model(url, "range=1h&project=shop&metric=jobs.done");
    expect(m.catalog.map((c) => [c.name, c.kind])).toEqual([
      ["process.memory.usage", "gauge"],
      ["http.server.request.duration", "histogram"],
      ["rpc.duration", "histogram"],
      ["jobs.done", "sum"],
      ["legacy.latency", "histogram"],
    ]);
    expect(m.selected).toMatchObject({ display: "rate", summary: { last: 1 } });
    expect(m.services).toEqual(["py-worker"]);
    expect((await model(url, "range=1h&project=other")).catalog).toEqual([]);
    const reg = (await (await fetch(`${url}/_wizelens/api/services`)).json()) as { services: { service: string }[] };
    expect(reg.services.map((s) => s.service)).toEqual(["py-worker"]);
  });

  it("takes protobuf and answers in protobuf", async () => {
    let url: string;
    ({ hub, url } = await startHub({ now: () => NOW }));
    const proto = encodeMetrics(body);
    const res = await fetch(`${url}/_wizelens/v1/metrics`, { method: "POST", headers: { "Content-Type": "application/x-protobuf" }, body: proto });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-protobuf");
    const m = await model(url, "range=1h&metric=http.server.request.duration");
    expect(m.catalog).toHaveLength(5);
    expect(m.selected!.groupKeys).toEqual(["http.route"]);
    expect(m.selected!.countRate!.some((v) => v !== null)).toBe(true);
  });

  it("takes metrics in add-on batches, with the sender's service", async () => {
    let url: string;
    ({ hub, url } = await startHub({ now: () => NOW }));
    const point: Partial<MetricPoint> = { name: "v8js.memory.heap.used", kind: "gauge", unit: "By", value: 5, timeMs: NOW - 60_000, service: "spoofed" };
    await post(`${url}/_wizelens/api/ingest`, { sender: { service: "orders-api" }, metrics: [point, { name: "bad" }] });
    const m = await model(url, "range=15m");
    expect(m.catalog.map((c) => [c.name, c.services])).toEqual([["v8js.memory.heap.used", ["orders-api"]]]);
    expect(m.runtime[0]).toMatchObject({ service: "orders-api", stats: [expect.objectContaining({ key: "heap" })] });
  });
});

describe("OTLP metric writes", () => {
  it("joins a cluster export's pods into one write, each point keeping its pod", () => {
    const pod = (name: string) => ({ attributes: [{ key: "k8s.pod.name", value: { stringValue: name } }, { key: "k8s.namespace.name", value: { stringValue: "shop" } }] });
    const phase = [{ name: "k8s.pod.phase", gauge: { dataPoints: [{ timeUnixNano: nanos(1), asInt: "2" }] } }];
    const list = ["orders-0", "orders-1", "cart-0"].map((n) => ({ resource: pod(n), scopeMetrics: [{ metrics: phase }] }));
    const writes = writesFromMetrics([...list, { resource, scopeMetrics: [{ metrics: phase }] }], []);
    expect(writes.map((w) => [w.sender.service, w.sender.k8s, w.metrics!.length])).toEqual([["infrastructure", undefined, 3], ["py-worker", undefined, 1]]);
    expect(writes[0]!.metrics!.map((p) => p.attributes["k8s.pod.name"])).toEqual(["orders-0", "orders-1", "cart-0"]);
  });
});
