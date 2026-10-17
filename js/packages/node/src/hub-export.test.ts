import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestBatch, Span } from "@wizeworks/lens-core";
import { HubExporter } from "./hub-export.js";

const span = (spanId: string) => ({ traceId: "a".repeat(32), spanId, attributes: {} }) as unknown as Span;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeHub(ok: () => boolean) {
  const batches: IngestBatch[] = [];
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    batches.push(JSON.parse(String(init!.body)) as IngestBatch);
    return new Response(null, { status: ok() ? 204 : 503 });
  }) as typeof fetch;
  return batches;
}

function exporter(clock: { now: number }, warn = vi.fn(), maxQueue?: number) {
  return new HubExporter({ url: "http://hub", sender: () => ({ service: "api" }), now: () => clock.now, warn, maxQueue });
}

describe("HubExporter", () => {
  it("sends queued spans in one batch, then only heartbeats", async () => {
    const batches = fakeHub(() => true);
    const clock = { now: 0 };
    const e = exporter(clock);
    e.add({ type: "span", span: span("1".repeat(16)) });
    e.add({ type: "remote", traceId: "a".repeat(32), endpoint: "http://x" });
    await e.tick();
    expect(batches[0]).toMatchObject({ sender: { service: "api" }, spans: [{ spanId: "1".repeat(16) }], remotes: [{ endpoint: "http://x" }] });
    await e.tick();
    expect(batches).toHaveLength(1);
    clock.now = 11_000;
    await e.tick();
    expect(batches[1]).toMatchObject({ spans: [], logs: [], remotes: [] });
  });

  it("keeps the data, backs off, and warns once while the hub is down", async () => {
    let up = false;
    const batches = fakeHub(() => up);
    const clock = { now: 0 };
    const warn = vi.fn();
    const e = exporter(clock, warn);
    e.add({ type: "span", span: span("1".repeat(16)) });
    await e.tick();
    await e.tick();
    expect(batches).toHaveLength(1);
    expect(e.queued).toBe(1);
    clock.now = 2500;
    await e.tick();
    expect(warn).toHaveBeenCalledTimes(1);
    up = true;
    clock.now = 10_000;
    await e.tick();
    expect(e.queued).toBe(0);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("again"));
  });

  it("drops the oldest items when the queue is full", () => {
    const e = exporter({ now: 0 }, vi.fn(), 2);
    for (const id of ["1", "2", "3"]) e.add({ type: "span", span: span(id.repeat(16)) });
    expect(e.queued).toBe(2);
    expect(e.dropped).toBe(1);
  });
});

describe("HubExporter tracing", () => {
  it("sends with tracing off, so no fetch wrapper (Next.js) traces the send", async () => {
    const { context } = await import("@opentelemetry/api");
    const { AsyncLocalStorageContextManager } = await import("@opentelemetry/context-async-hooks");
    const { isTracingSuppressed } = await import("@opentelemetry/core");
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    const suppressed: boolean[] = [];
    globalThis.fetch = vi.fn(async () => {
      suppressed.push(isTracingSuppressed(context.active()));
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const e = exporter({ now: 0 });
    e.add({ type: "span", span: span("1".repeat(16)) });
    await e.tick();
    context.disable();
    expect(suppressed).toEqual([true]);
  });
});
