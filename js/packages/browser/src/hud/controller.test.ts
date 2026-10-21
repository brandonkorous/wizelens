import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { span } from "../test-env.js";
import { stubDom } from "../test-dom.js";
import { byClass, FakeElement, findAll, flushRenders, one, stubHudDom } from "../test-hud-dom.js";
import { fakeRecorder, type FakeRecorder, row, serverStats, stubLocalStorage } from "../test-hud.js";
import { HudController } from "./controller.js";

let local: Map<string, string>;
let recorder: FakeRecorder;
let root: FakeElement;
let hud: HudController;

beforeEach(() => {
  stubDom();
  stubHudDom();
  local = stubLocalStorage();
  recorder = fakeRecorder();
  root = new FakeElement("div");
  hud = new HudController(recorder, root as unknown as Node, () => 500);
});
afterEach(() => {
  hud.stop();
  vi.unstubAllGlobals();
});

const click = (el: FakeElement) => el.fire("click");
const buttonTitled = (title: string) => findAll(root, (el) => el.nodeName === "BUTTON" && el.getAttribute("title") === title)[0]!;

it("shows the full card when nothing is stored", () => {
  hud.start();
  expect(byClass(root, "wl-card")).toHaveLength(1);
  expect(byClass(root, "wl-mini")).toHaveLength(0);
  expect(one(root, "wl-hud").getAttribute("role")).toBe("complementary");
  expect(one(root, "wl-req").textContent).toBe("—");
  expect(one(root, "wl-foot").textContent).toBe("0 SQL0 FetchNo Data");
  expect(byClass(root, "wl-tip")).toHaveLength(0);
});

it("shows the request on screen, its timings, tips, and dashboard links", () => {
  recorder.store.upsert(row({ server: serverStats({ insights: 2 }) }));
  hud.start();
  expect(one(root, "wl-req").textContent).toBe("GET /api/orders/1284");
  expect(one(root, "wl-pill").textContent).toBe("200");
  expect(byClass(root, "wl-val").map((v) => v.textContent)).toEqual(["284 ms", "186 ms", "92 ms", "41 ms"]);
  const metric = byClass(root, "wl-metric")[2]!;
  expect(metric.getAttribute("aria-describedby")).toBe("wl-tip-db");
  expect(byClass(root, "wl-tip")[2]!.textContent).toContain("4 queries");
  const sql = byClass(root, "wl-count")[0]!;
  expect(sql.nodeName).toBe("A");
  expect(sql.getAttribute("href")).toBe("http://app.test/_wizelens/#/traces/t1/sql");
  expect(sql.getAttribute("target")).toBe("_blank");
  expect(byClass(root, "wl-count")[2]!.textContent).toBe("2 Insights");
});

it("patches the card in place on updates, so hover tips and focus stay", async () => {
  recorder.store.upsert(row());
  hud.start();
  const [cardEl, button, tip] = [one(root, "wl-card"), byClass(root, "wl-metric")[0], byClass(root, "wl-tip")[0]];
  recorder.store.upsert(row({ id: "s2", path: "/api/cart", url: "http://app.test/api/cart" }));
  await flushRenders();
  expect(one(root, "wl-req").textContent).toBe("GET /api/cart");
  expect(one(root, "wl-card")).toBe(cardEl);
  expect(byClass(root, "wl-metric")[0]).toBe(button);
  expect(byClass(root, "wl-tip")[0]).toBe(tip);
});

it("minimizes to the aperture with the health color, and opens again", async () => {
  recorder.store.upsert(row({ status: 500, error: null }));
  hud.start();
  click(buttonTitled("Minimize WizeLens"));
  await flushRenders();
  expect(local.get("wizelens.hud.min")).toBe("1");
  const mini = one(root, "wl-mini");
  expect(mini.getAttribute("class")).toContain("wl-h-critical");
  expect(mini.getAttribute("aria-label")).toBe("Show WizeLens");
  expect(byClass(root, "wl-card")).toHaveLength(0);
  click(mini);
  await flushRenders();
  expect(byClass(root, "wl-card")).toHaveLength(1);
});

it("marks the aperture busy while a request runs", () => {
  local.set("wizelens.hud.min", "1");
  recorder.store.upsert(row({ durationMs: null, status: null }));
  hud.start();
  expect(one(root, "wl-mini").getAttribute("class")).toContain("wl-busy");
});

it("pauses on the request on screen, and follows the newest again", async () => {
  recorder.store.upsert(row({ id: "s1", path: "/a" }));
  hud.start();
  click(buttonTitled("Live: shows the newest request. Click to pin this one."));
  recorder.store.upsert(row({ id: "s2", path: "/b" }));
  await flushRenders();
  expect(local.get("wizelens.hud.live")).toBe("0");
  expect(one(root, "wl-req").textContent).toBe("GET /a");
  click(buttonTitled("Paused on this request. Click to follow the newest."));
  await flushRenders();
  expect(one(root, "wl-req").textContent).toBe("GET /b");
});

it("loads full stats for a restored row on screen, once", async () => {
  recorder.store.upsert(row({ restored: true, traceId: "t7" }));
  hud.start();
  recorder.store.patch("s1", { renderMs: 50 });
  await flushRenders();
  expect(recorder.statsLoads).toEqual(["t7"]);
});

it("opens the details with errors, insights, and security risks apart, and Esc closes it", async () => {
  const req = row({ startMs: 0, durationMs: 200, server: serverStats({ errorCount: 1 }) });
  recorder.store.upsert(req);
  recorder.traces.set("t1", { traceId: "t1", spans: [span("10", "http.server", "api", 150, { status: "error", name: "GET /api/orders" })] } as never);
  hud.start();
  const cardEl = one(root, "wl-card");
  click(one(root, "wl-chev"));
  await flushRenders();
  const panel = one(root, "wl-details");
  expect(one(root, "wl-card")).toBe(cardEl);
  expect(one(root, "wl-chev").getAttribute("aria-expanded")).toBe("true");
  expect(panel.textContent).toContain("Timeline");
  expect(findAll(panel, (el) => el.nodeName === "H3").map((el) => el.textContent)).toEqual(["Timeline", "Errors · 1", "This page"]);
  expect(byClass(panel, "wl-more").map((a) => a.getAttribute("href"))).toContain("http://app.test/_wizelens/#/traces/t1/errors");
  dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  await flushRenders();
  expect(byClass(root, "wl-details")).toHaveLength(0);
  expect(local.get("wizelens.hud.panel")).toBe("");
});

it("shows the settings, follows the live switch, and clears the list", async () => {
  recorder.store.upsert(row());
  hud.start();
  click(buttonTitled("Settings"));
  await flushRenders();
  const panel = one(root, "wl-settings");
  expect(panel.textContent).toContain("http://app.test/_wizelens");
  expect(panel.textContent).toContain("sess-1");
  expect(panel.textContent).toContain("500 ms or more");
  const box = findAll(panel, (el) => el.nodeName === "INPUT")[0]!;
  expect(box.checked).toBe(true);
  box.checked = false;
  box.fire("change");
  await flushRenders();
  expect(local.get("wizelens.hud.live")).toBe("0");
  click(findAll(panel, (el) => el.textContent === "Clear the request list")[0]!);
  await flushRenders();
  expect(one(root, "wl-req").textContent).toBe("—");
  click(buttonTitled("Close (Esc)"));
  await flushRenders();
  expect(byClass(root, "wl-settings")).toHaveLength(0);
});

it("stops listening and empties its root on stop", () => {
  hud.start();
  expect(recorder.listeners()).toBe(1);
  hud.stop();
  expect(recorder.listeners()).toBe(0);
  expect(root.childNodes).toHaveLength(0);
});
