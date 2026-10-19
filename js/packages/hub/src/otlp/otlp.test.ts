import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { isLooseTraceId } from "@wizeworks/lens-core";
import type { Hub } from "../hub.js";
import { startHub } from "../test/helpers.js";
import { encodeTraces } from "./proto.js";

const TRACE = "0af7651916cd43dd8448eb211c80319c";
const SPAN = "b7ad6b7169203331";
const resource = {
  attributes: [
    { key: "service.name", value: { stringValue: "py-worker" } },
    { key: "service.namespace", value: { stringValue: "shop" } },
    { key: "telemetry.sdk.language", value: { stringValue: "python" } },
  ],
};
const otlpSpan = (ids: { traceId: string; spanId: string }) => ({
  ...ids,
  name: "SELECT orders",
  kind: 3,
  startTimeUnixNano: "1700000000000000000",
  endTimeUnixNano: "1700000000012500000",
  attributes: [
    { key: "db.system", value: { stringValue: "postgresql" } },
    { key: "db.statement", value: { stringValue: "select * from orders" } },
  ],
  status: { code: 2, message: "boom" },
});

let hub: Hub;
afterEach(() => hub?.close());

async function stored(url: string) {
  const res = await fetch(`${url}/_wizelens/api/traces/${TRACE}`);
  return (await res.json()) as { spans: Record<string, unknown>[] };
}

describe("OTLP/HTTP", () => {
  it("takes JSON spans and maps old attribute names", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    const body = { resourceSpans: [{ resource, scopeSpans: [{ spans: [otlpSpan({ traceId: TRACE, spanId: SPAN })] }] }] };
    const res = await fetch(`${url}/v1/traces`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const [s] = (await stored(url)).spans;
    expect(s).toMatchObject({ service: "py-worker", category: "db", kind: "client", status: "error", startMs: 1_700_000_000_000, durationMs: 12.5 });
    expect(s!.attributes).toMatchObject({ "db.system.name": "postgresql", "db.query.text": "select * from orders" });
    const reg = (await (await fetch(`${url}/_wizelens/api/services`)).json()) as { services: unknown[]; projects: string[] };
    expect(reg.services[0]).toMatchObject({ service: "py-worker", project: "shop", via: "otlp", runtime: "otlp python" });
    expect(reg.projects).toEqual(["shop"]);
  });

  it("takes gzip protobuf spans", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    const b64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");
    const proto = encodeTraces({ resourceSpans: [{ resource, scopeSpans: [{ spans: [otlpSpan({ traceId: b64(TRACE), spanId: b64(SPAN) })] }] }] });
    const headers = { "Content-Type": "application/x-protobuf", "Content-Encoding": "gzip" };
    const res = await fetch(`${url}/v1/traces`, { method: "POST", headers, body: gzipSync(proto) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-protobuf");
    expect((await stored(url)).spans[0]).toMatchObject({ traceId: TRACE, spanId: SPAN, name: "SELECT orders" });
  });

  it("keeps logs of a trace in it, and logs without one as loose lines", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    const log = (traceId?: string) => ({ timeUnixNano: "1700000000001000000", severityNumber: 13, body: { stringValue: "slow" }, traceId, spanId: SPAN });
    const body = { resourceLogs: [{ resource, scopeLogs: [{ scope: { name: "orders" }, logRecords: [log(TRACE), log()] }] }] };
    await fetch(`${url}/v1/logs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = (await (await fetch(`${url}/_wizelens/api/traces/${TRACE}`)).json()) as { logs: unknown[] };
    expect(t.logs).toEqual([expect.objectContaining({ level: "warn", message: "slow", category: "orders", service: "py-worker" })]);
    const full = (await (await fetch(`${url}/_wizelens/api/traces?full=true`)).json()) as { traceId: string; logs: { spanId: string | null }[] }[];
    const loose = full.filter((x) => isLooseTraceId(x.traceId));
    expect(loose.map((x) => x.logs.map((l) => l.spanId))).toEqual([[null]]);
    const list = (await (await fetch(`${url}/_wizelens/api/traces`)).json()) as { traceId: string }[];
    expect(list.map((x) => x.traceId)).toEqual([TRACE]);
  });
});
