import { createWizeLens } from "@wizeworks/lens-node";
import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { startHub } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

it("a Node add-on with `hub` set sends its spans and logs to the hub", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  const wl = createWizeLens({ serviceName: "orders-api", storage: "memory", instrumentFetch: false, hub: url, project: "shop" });
  const span = wl.tracer.startSpan("work");
  const traceId = span.spanContext().traceId;
  wl.store.addLog(traceId, { timeMs: Date.now(), level: "info", category: "app", message: "hello", service: "orders-api", spanId: null, attributes: {} });
  span.end();
  await wl.shutdown();
  const t = (await (await fetch(`${url}/_wizelens/api/traces/${traceId}`)).json()) as { spans: { name: string }[]; logs: { message: string }[] };
  expect(t.spans.map((s) => s.name)).toEqual(["work"]);
  expect(t.logs.map((l) => l.message)).toEqual(["hello"]);
  const reg = (await (await fetch(`${url}/_wizelens/api/services`)).json()) as { services: { service: string; project?: string; runtime?: string }[] };
  expect(reg.services[0]).toMatchObject({ service: "orders-api", project: "shop", runtime: expect.stringContaining("node") });
});
