import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WizeLens as Lens } from "@wizeworks/lens-browser";
import { componentName, componentTrail, type VueAppLike, type VueErrorHandler, wizeLensKey, WizeLensPlugin } from "./plugin.js";

function fakeLens(enabled = true): Lens {
  return { enabled, recorder: null, sessionId: "s", pageView: vi.fn(), captureError: vi.fn(), setUser: vi.fn(), flush: vi.fn(), shutdown: vi.fn() };
}

function fakeApp() {
  const provided = new Map<symbol, unknown>();
  const unmount: (() => void)[] = [];
  const app: VueAppLike & { config: { errorHandler?: VueErrorHandler | null; globalProperties: Record<string, unknown> } } = {
    config: { globalProperties: {} },
    provide: (key, value) => provided.set(key, value),
    onUnmount: (fn) => void unmount.push(fn),
  };
  return { app, provided, unmount: () => unmount.forEach((f) => f()) };
}

function fakeRouter() {
  const guards: ((to: { fullPath: string }, from: unknown, failure?: unknown) => unknown)[] = [];
  return {
    guards,
    afterEach(guard: (typeof guards)[number]) {
      guards.push(guard);
      return () => void guards.splice(guards.indexOf(guard), 1);
    },
  };
}

const cart = { $options: { __name: "CartPage" }, $parent: { $options: { name: "App" }, $parent: null } };

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("sends errors Vue catches with the component that threw, and keeps the app's own handler", () => {
  const lens = fakeLens();
  const { app } = fakeApp();
  const own = vi.fn();
  app.config.errorHandler = own;
  WizeLensPlugin.install(app, { lens });
  const err = new Error("boom");
  app.config.errorHandler!(err, cart, "setup function");
  expect(lens.captureError).toHaveBeenCalledWith(err, { "vue.component": "CartPage", "vue.component.trail": "App > CartPage", "vue.info": "setup function" });
  expect(own).toHaveBeenCalledWith(err, cart, "setup function");
  expect(console.error).not.toHaveBeenCalled();
});

it("logs the error like Vue does when the app had no handler", () => {
  const { app } = fakeApp();
  WizeLensPlugin.install(app, { lens: fakeLens() });
  app.config.errorHandler!("bad", null, "render function");
  expect(console.error).toHaveBeenCalledWith("bad");
});

it("records finished router navigations as page views, and undoes it all on unmount", () => {
  const lens = fakeLens();
  const router = fakeRouter();
  const { app, provided, unmount } = fakeApp();
  WizeLensPlugin.install(app, { lens, router });
  expect(provided.get(wizeLensKey)).toBe(lens);
  expect(app.config.globalProperties.$wizelens).toBe(lens);
  router.guards[0]!({ fullPath: "/orders/7?tab=1" }, {});
  router.guards[0]!({ fullPath: "/blocked" }, {}, new Error("aborted"));
  expect(lens.pageView).toHaveBeenCalledTimes(1);
  expect(lens.pageView).toHaveBeenCalledWith("/orders/7?tab=1");
  unmount();
  expect(router.guards).toHaveLength(0);
  expect(app.config.errorHandler).toBeUndefined();
});

it("hooks nothing when WizeLens is off", () => {
  const router = fakeRouter();
  const { app } = fakeApp();
  WizeLensPlugin.install(app, { lens: fakeLens(false), router });
  expect(app.config.errorHandler).toBeUndefined();
  expect(router.guards).toHaveLength(0);
});

it("starts a disabled instance outside a browser", () => {
  const { app, provided } = fakeApp();
  WizeLensPlugin.install(app, { endpoint: "/_wizelens" });
  expect((provided.get(wizeLensKey) as Lens).enabled).toBe(false);
});

it("names components by name, SFC name, or file", () => {
  expect(componentName({ $options: { name: "A", __name: "B" } })).toBe("A");
  expect(componentName({ $options: { __file: "src/pages/OrderList.vue" } })).toBe("OrderList");
  expect(componentName(null)).toBe("Anonymous");
  expect(componentTrail(null)).toBe("");
});
