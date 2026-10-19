import { afterEach, expect, it, vi } from "vitest";
import { loadView } from "./pageview-tracker.js";
import { stubPage } from "./test-env.js";
import { firstHiddenAt } from "./vitals.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { __wizelensLoadView?: unknown }).__wizelensLoadView;
});

it("sends the full-load view of a page once, even when a second tracker starts", () => {
  stubPage();
  const first = loadView();
  const again = loadView();
  expect(first.sent).toBe(false);
  expect(again).toMatchObject({ traceId: first.traceId, spanId: first.spanId, sent: true });
});

it("starts a new full-load view on a new page", () => {
  stubPage();
  const first = loadView();
  vi.stubGlobal("performance", { timeOrigin: performance.timeOrigin + 5000, now: () => 0 });
  expect(loadView()).toMatchObject({ sent: false });
  expect(loadView().traceId).not.toBe(first.traceId);
});

it("knows when the tab was hidden before WizeLens started", () => {
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.stubGlobal("performance", { getEntriesByType: () => [{ name: "visible", startTime: 0 }, { name: "hidden", startTime: 1200 }] });
  expect(firstHiddenAt()).toBe(1200);
  vi.stubGlobal("performance", { getEntriesByType: () => [] });
  expect(firstHiddenAt()).toBe(Infinity);
  vi.stubGlobal("document", { visibilityState: "hidden" });
  expect(firstHiddenAt()).toBe(0);
});
