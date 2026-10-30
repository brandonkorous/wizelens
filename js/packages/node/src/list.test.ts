import { hostname } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newTraceId, type ServiceInfo, type Trace, type TraceSummary } from "@wizeworks/lens-core";
import { createWizeLens } from "./index.js";
import { fakeSpan, getJson, type Running, startApp } from "./test/helpers.js";

const wizelens = createWizeLens({ service: "list-api", enabled: true, storage: "memory", instrumentFetch: false, slowQueryMs: 250 });
let app: Running;
const now = Date.now();
const ids = [newTraceId(), newTraceId(), newTraceId()];

beforeAll(async () => {
  app = await startApp(wizelens, () => {});
  ids.forEach((id, i) => wizelens.store.addSpan({ ...fakeSpan(id, now - 60_000 + i * 20_000), durationMs: 5 }));
});

afterAll(async () => {
  await wizelens.shutdown();
  await app.close();
});

const api = (q: string) => getJson<Trace[] & TraceSummary[]>(`${app.base}/_wizelens/api/traces${q}`);

describe("api/traces?full=true", () => {
  it("returns full local traces, newest first", async () => {
    const full = await api("?full=true");
    expect(full.map((t) => t.traceId)).toEqual([ids[2], ids[1], ids[0]]);
    expect(full[0]!.spans).toHaveLength(1);
    expect(full[0]!.logs).toEqual([]);
  });

  it("keeps summaries without full", async () => {
    const list = await api("");
    expect(list).toHaveLength(3);
    expect("spans" in list[0]!).toBe(false);
  });

  it("filters by last activity with since, and limits", async () => {
    const since = now - 60_000 + 20_000;
    expect((await api(`?full=true&since=${since}`)).map((t) => t.traceId)).toEqual([ids[2], ids[1]]);
    expect((await api(`?full=true&since=${since + 6}`)).map((t) => t.traceId)).toEqual([ids[2]]);
    expect(await api("?full=true&limit=1")).toHaveLength(1);
  });
});

describe("api/info", () => {
  it("describes the service and its setup", async () => {
    const info = await getJson<ServiceInfo>(`${app.base}/_wizelens/api/info`);
    expect(info).toMatchObject({
      mode: "in-app",
      capabilities: ["federation", "search", "tags", "metrics", "sourcemaps"],
      service: "list-api",
      mcp: false,
      environment: process.env.NODE_ENV || "development",
      host: hostname(),
      storage: { kind: "memory", maxTraces: 2000, maxAgeMs: 24 * 60 * 60 * 1000 },
      analysis: { slowQueryMs: 250, nPlusOneThreshold: 5 },
      captureResponseBody: false,
    });
    expect(info.redactKeys).toContain("authorization");
    expect(info.startedMs).toBeLessThanOrEqual(Date.now());
  });
});

describe("api/search", () => {
  it("searches this service's traces in memory, with paging and autocomplete", async () => {
    type Page = { kind: string; items: { traceId: string }[]; next: string | null };
    const first = await getJson<Page>(`${app.base}/_wizelens/api/search?kind=traces&range=1h&limit=2`);
    expect(first.items.map((t) => t.traceId)).toEqual([ids[2], ids[1]]);
    const rest = await getJson<Page>(`${app.base}/_wizelens/api/search?kind=traces&range=1h&limit=2&cursor=${encodeURIComponent(first.next!)}`);
    expect(rest).toMatchObject({ items: [{ traceId: ids[0] }], next: null });
    const none = await getJson<Page>(`${app.base}/_wizelens/api/search?kind=spans&q=${encodeURIComponent("service:nope")}`);
    expect(none.items).toEqual([]);
    const bad = await fetch(`${app.base}/_wizelens/api/search?q=${encodeURIComponent("(a")}`);
    expect(bad.status).toBe(400);
    const fields = await getJson<{ items: { value: string }[] }>(`${app.base}/_wizelens/api/search/suggest?prefix=dur`);
    expect(fields.items.map((s) => s.value)).toEqual(["duration"]);
  });
});
