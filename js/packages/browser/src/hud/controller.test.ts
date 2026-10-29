import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { span } from "../test-env.js";
import { stubDom } from "../test-dom.js";
import { byClass, FakeElement, findAll, flushRenders, one, stubHudDom } from "../test-hud-dom.js";
import { fakeRecorder, type FakeRecorder, row, serverStats, stubLocalStorage } from "../test-hud.js";
import { now } from "../session.js";
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
const foot = () => one(root, "wl-foot").textContent;
const call = (id: string, path: string, over = {}) => row({ id, path, url: `http://app.test${path}`, traceId: `t-${id}`, server: serverStats({ name: `GET ${path}`, insights: 0 }), ...over });

it("shows the page, with nothing counted yet", () => {
  hud.start();
  expect(byClass(root, "wl-card")).toHaveLength(1);
  expect(one(root, "wl-hud").getAttribute("role")).toBe("complementary");
  expect(one(root, "wl-req").textContent).toBe("GET /page");
  expect(foot()).toBe("0 SQL0 Fetch0 Insights");
  expect(byClass(root, "wl-mini")).toHaveLength(0);
});

it("says Not traced for Server and Database on a page no WizeLens server saw, like a static site", () => {
  hud.start();
  expect(byClass(root, "wl-val").map((v) => v.textContent).slice(1, 3)).toEqual(["Not traced", "Not traced"]);
});

it("adds up the page's calls: server and database time, queries, fetches, and insights", () => {
  recorder.store.upsert(call("s1", "/api/orders", { server: serverStats({ insights: 2 }) }));
  recorder.store.upsert(call("s2", "/api/cart"));
  hud.start();
  expect(one(root, "wl-req").textContent).toBe("GET /page");
  expect(byClass(root, "wl-val").map((v) => v.textContent).slice(1, 3)).toEqual(["372 ms", "184 ms"]);
  expect(foot()).toBe("8 SQL2 Fetch2 Insights");
  expect(byClass(root, "wl-tip")[2]!.textContent).toContain("8 queries · The page and its 2 calls, added up");
});

it("stays on the page as calls come in, and patches the card in place", async () => {
  recorder.store.upsert(call("s1", "/api/a"));
  hud.start();
  const [cardEl, button] = [one(root, "wl-card"), byClass(root, "wl-metric")[0]];
  recorder.store.upsert(call("s2", "/api/b", { status: 500 }));
  await flushRenders();
  expect(one(root, "wl-req").textContent).toBe("GET /page");
  expect(one(root, "wl-pill").textContent).toBe("500");
  expect(foot()).toContain("2 Fetch");
  expect(one(root, "wl-card")).toBe(cardEl);
  expect(byClass(root, "wl-metric")[0]).toBe(button);
});

it("keeps counting calls after they fall out of the recorder's short list", async () => {
  hud.start();
  for (let i = 0; i < 35; i++) recorder.store.upsert(call(`s${i}`, `/api/panel/${i}`));
  await flushRenders();
  expect(foot()).toBe("140 SQL35 Fetch0 Insights");
});

it("adds the stats of calls that left the recorder's list before their stats came", async () => {
  hud.start();
  recorder.store.upsert(call("early", "/api/early", { server: undefined }));
  for (let i = 0; i < 30; i++) recorder.store.upsert(call(`s${i}`, `/api/panel/${i}`));
  recorder.stats.set("t-early", serverStats({ dbCount: 9, insights: 1 }));
  recorder.store.patch("s0", { renderMs: 1 });
  await flushRenders();
  expect(foot()).toBe("129 SQL31 Fetch1 Insight");
});

it("starts a new page on a route change, and pins a page while live is off", async () => {
  recorder.store.upsert(call("s1", "/api/a"));
  hud.start();
  history.pushState(null, "", "/orders");
  recorder.store.upsert(call("s2", "/api/orders", { startMs: now() + 1 }));
  await flushRenders();
  expect(one(root, "wl-req").textContent).toBe("GET /orders");
  expect(foot()).toContain("1 Fetch");
  click(buttonTitled("Live: follows the page you are on. Click to pause on what you see now."));
  history.pushState(null, "", "/cart");
  await flushRenders();
  expect(local.get("wizelens.hud.live")).toBe("0");
  expect(one(root, "wl-req").textContent).toBe("GET /orders");
  click(buttonTitled("Paused: new calls and pages wait. Click to go live."));
  await flushRenders();
  expect(one(root, "wl-req").textContent).toBe("GET /cart");
});

it("pauses with a pause button: new calls wait, and play shows them", async () => {
  recorder.store.upsert(call("s1", "/api/a"));
  hud.start();
  const button = () => buttonTitled(local.get("wizelens.hud.live") === "0" ? "Paused: new calls and pages wait. Click to go live." : "Live: follows the page you are on. Click to pause on what you see now.");
  expect(button().getAttribute("aria-label")).toBe("Pause");
  click(button());
  await flushRenders();
  expect(button().getAttribute("aria-label")).toBe("Go live");
  recorder.store.upsert(call("s2", "/api/b", { startMs: now() + 5 }));
  await flushRenders();
  expect(foot()).toContain("1 Fetch");
  click(button());
  await flushRenders();
  expect(button().getAttribute("aria-label")).toBe("Pause");
  expect(foot()).toContain("2 Fetch");
});

it("minimizes to the aperture with the health color, and opens again", async () => {
  recorder.store.upsert(call("s1", "/api/a", { status: 500 }));
  hud.start();
  click(buttonTitled("Minimize WizeLens"));
  await flushRenders();
  expect(local.get("wizelens.hud.min")).toBe("1");
  const mini = one(root, "wl-mini");
  expect(mini.getAttribute("class")).toContain("wl-h-critical");
  expect(byClass(root, "wl-card")).toHaveLength(0);
  click(mini);
  await flushRenders();
  expect(byClass(root, "wl-card")).toHaveLength(1);
});

it("marks the aperture busy while a call runs", () => {
  local.set("wizelens.hud.min", "1");
  recorder.store.upsert(row({ durationMs: null, status: null }));
  hud.start();
  expect(one(root, "wl-mini").getAttribute("class")).toContain("wl-busy");
});

it("lists the page's calls in the details, adds new ones, and shows the errors of flagged calls", async () => {
  recorder.store.upsert(call("s1", "/api/orders", { server: serverStats({ errorCount: 1 }) }));
  recorder.traces.set("t-s1", { traceId: "t-s1", spans: [span("10", "http.server", "api", 150, { status: "error", name: "GET /api/orders" })] } as never);
  hud.start();
  click(one(root, "wl-chev"));
  await flushRenders();
  const panel = one(root, "wl-details");
  const names = () => byClass(panel, "wl-wf-name").map((n) => n.textContent);
  expect(names()).toEqual(["GET /api/orders · 4 SQL"]);
  expect(findAll(panel, (el) => el.nodeName === "A" && el.getAttribute("href") === "http://app.test/_wizelens/#/traces/t-s1")).toHaveLength(1);
  recorder.store.upsert(call("s2", "/api/cart", { startMs: now() }));
  await flushRenders();
  expect(names()).toEqual(["GET /api/orders · 4 SQL", "GET /api/cart · 4 SQL"]);
  expect(findAll(panel, (el) => el.nodeName === "H3").map((el) => el.textContent)).toEqual(["Errors · 1", "Calls · 2", "This page"]);
  dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  await flushRenders();
  expect(byClass(root, "wl-details")).toHaveLength(0);
  expect(local.get("wizelens.hud.panel")).toBe("");
});

it("shows the settings, follows the live switch, and clears the page's calls", async () => {
  recorder.store.upsert(call("s1", "/api/a"));
  hud.start();
  click(buttonTitled("Settings"));
  await flushRenders();
  const panel = one(root, "wl-settings");
  expect(panel.textContent).toContain("http://app.test/_wizelens");
  expect(panel.textContent).toContain("500 ms or more");
  const box = findAll(panel, (el) => el.nodeName === "INPUT")[0]!;
  box.checked = false;
  box.fire("change");
  await flushRenders();
  expect(local.get("wizelens.hud.live")).toBe("0");
  click(findAll(panel, (el) => el.textContent === "Clear this page's calls")[0]!);
  await flushRenders();
  expect(foot()).toBe("0 SQL0 Fetch0 Insights");
  click(buttonTitled("Close (Esc)"));
  await flushRenders();
  expect(byClass(root, "wl-settings")).toHaveLength(0);
});

it("moves to the bottom left from the settings, and remembers it", async () => {
  hud.start();
  click(buttonTitled("Settings"));
  await flushRenders();
  const box = findAll(one(root, "wl-settings"), (el) => el.nodeName === "INPUT")[1]!;
  box.checked = true;
  box.fire("change");
  await flushRenders();
  expect(local.get("wizelens.hud.side")).toBe("left");
  expect(one(root, "wl-hud").getAttribute("class")).toBe("wl-hud wl-left");
});

it("stops listening and empties its root on stop", () => {
  hud.start();
  expect(recorder.listeners()).toBe(1);
  hud.stop();
  expect(recorder.listeners()).toBe(0);
  expect(root.childNodes).toHaveLength(0);
});
