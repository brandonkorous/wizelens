import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATTR_ROUTED_MS, type Trace } from "@wizeworks/lens-core";
import { createWizeLens } from "./index.js";
import { getJson, type Running, settle, startApp } from "./test/helpers.js";

const wizelens = createWizeLens({ service: "route-api", enabled: true, storage: "memory", instrumentFetch: false });
let app: Running;

beforeAll(async () => {
  app = await startApp(wizelens, (a) => {
    a.use((_req, _res, next) => void setTimeout(next, 30));
    a.get("/items/:id", (_req, res) => void res.json({ ok: true }));
  });
});
afterAll(() => app.close());

describe("routing time", () => {
  it("records the time until the matched route starts", async () => {
    const res = await fetch(`${app.base}/items/7`);
    await settle();
    const t = await getJson<Trace>(`${app.base}/_wizelens/api/traces/${res.headers.get("x-wizelens-trace")}`);
    const server = t.spans.find((s) => s.category === "http.server")!;
    expect(server.attributes["http.route"]).toBe("/items/:id");
    expect(server.attributes[ATTR_ROUTED_MS]).toBeGreaterThanOrEqual(25);
    expect(server.attributes[ATTR_ROUTED_MS] as number).toBeLessThan(server.durationMs);
  });
});
