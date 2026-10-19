import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRecorder as createBrowserRecorder, newPageView } from "@wizeworks/lens-browser";
import { createRecorder, reactFramework, reactStatsSpan } from "./react-capture.js";
import { drainReactStats, handleCommit } from "./react-hook.js";

function Card() {}
const leaf = { tag: 0, type: Card, child: null, sibling: null, alternate: null, memoizedProps: {}, memoizedState: null, flags: 1, actualDuration: 4, selfBaseDuration: 3 };
const root = { current: { tag: 3, type: null, child: leaf, sibling: null, alternate: { tag: 3, type: null, child: null, sibling: null, alternate: null, memoizedProps: null, memoizedState: null }, memoizedProps: null, memoizedState: null } };

class FakeXhr {
  open() {}
  send() {}
}
const realOpen = FakeXhr.prototype.open;

beforeEach(() => {
  vi.stubGlobal("location", new URL("http://app.test/cart"));
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  drainReactStats();
});
afterEach(() => vi.unstubAllGlobals());

it("sends React render stats in the page view's trace, and nothing when React did not render", () => {
  const view = newPageView("load", 0);
  expect(reactStatsSpan(view, 0, "s1")).toBeNull();
  handleCommit(root);
  const span = reactStatsSpan(view, 0, "s1")!;
  expect(span).toMatchObject({ traceId: view.traceId, parentSpanId: view.spanId, name: "react renders /cart", category: "browser" });
  expect(span.attributes).toMatchObject({ "wizelens.browser.type": "react", "wizelens.react.commits": 1 });
  expect(JSON.parse(String(span.attributes["wizelens.react.components"]))[0]).toMatchObject({ name: "Card", renders: 1 });
});

it("gives browser capture React's stats, hydration time, and render wait", async () => {
  const hooks = reactFramework(1234);
  expect(hooks.statsIntervalMs).toBe(1234);
  expect(hooks.statsSpan).toBe(reactStatsSpan);
  await expect(hooks.waitForRender!(1)).resolves.toBeUndefined();
  expect(typeof hooks.firstRenderMs!()).not.toBe("undefined");
});

it("leaves XMLHttpRequest alone in React apps, as before, unless asked", () => {
  const undo = createRecorder({ capturePages: false, readServer: false }).install();
  expect(FakeXhr.prototype.open).toBe(realOpen);
  undo();
  const undoXhr = createRecorder({ capturePages: false, readServer: false, captureXhr: true }).install();
  expect(FakeXhr.prototype.open).not.toBe(realOpen);
  undoXhr();
  expect(FakeXhr.prototype.open).toBe(realOpen);
  const undoPlain = createBrowserRecorder({ capturePages: false, readServer: false }).install();
  expect(FakeXhr.prototype.open).not.toBe(realOpen);
  undoPlain();
});
