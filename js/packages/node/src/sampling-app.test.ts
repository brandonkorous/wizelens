import { afterAll, expect, it } from "vitest";
import { startApp, type Running } from "./test/helpers.js";
import { createWizeLens } from "./wizelens.js";

const wl = createWizeLens({ service: "api", storage: "memory", instrumentFetch: false, sampling: { rate: 0, keepSlowMs: 200 } });
const app: Running = await startApp(wl, (a) => {
  a.get("/ok", (_req, res) => {
    wl.logger.info("fine");
    res.json({ ok: true });
  });
  a.get("/fail", () => {
    wl.logger.info("about to fail");
    throw new Error("boom");
  });
  a.get("/slow", (_req, res) => void setTimeout(() => res.json({ ok: true }), 250));
});
afterAll(() => app.close());

const traceOf = async (path: string) => (await fetch(`${app.base}${path}`)).headers.get("x-wizelens-trace")!;

it("drops a fine request outside the rate", async () => {
  const id = await traceOf("/ok");
  expect(wl.store.get(id)).toBeUndefined();
});

it("keeps a failed request with its logs, and a slow one", async () => {
  const failed = wl.store.get(await traceOf("/fail"))!;
  expect(failed.spans.some((s) => s.status === "error")).toBe(true);
  expect(failed.logs.map((l) => l.message)).toContain("about to fail");
  expect(wl.store.get(await traceOf("/slow"))).toBeDefined();
});

it("shows the setting in the service info", async () => {
  const info = (await (await fetch(`${app.base}/_wizelens/api/info`)).json()) as { sampling?: unknown };
  expect(info.sampling).toEqual({ rate: 0, keepErrors: true, keepSlowMs: 200 });
});
