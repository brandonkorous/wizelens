import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WizeLens } from "@wizeworks/lens-browser";
import { createWizeLensErrorHandler, isNavigationEnd, trackAngularRouter, unwrapAngularError } from "./index.js";

function fakeLens(enabled = true): WizeLens {
  return { enabled, recorder: null, sessionId: "s", pageView: vi.fn(), captureError: vi.fn(), setUser: vi.fn(), flush: vi.fn(), shutdown: vi.fn() };
}

// Router.events: a tiny observable.
function fakeRouter() {
  const subscribers = new Set<(e: unknown) => void>();
  return {
    subscribers,
    emit: (e: unknown) => subscribers.forEach((s) => s(e)),
    events: {
      subscribe(next: (e: unknown) => void) {
        subscribers.add(next);
        return { unsubscribe: () => void subscribers.delete(next) };
      },
    },
  };
}

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("sends each error Angular catches, unwrapped, and logs it like Angular does", () => {
  const lens = fakeLens();
  const handler = createWizeLensErrorHandler(lens);
  const cause = new Error("load failed");
  const wrapped = Object.assign(new Error("Uncaught (in promise): Error: load failed"), { rejection: cause });
  handler.handleError(wrapped);
  expect(lens.captureError).toHaveBeenCalledWith(cause, { "angular.handler": "ErrorHandler" });
  expect(console.error).toHaveBeenCalledWith("ERROR", wrapped);
});

it("unwraps zone.js rejections and older wrapped errors, and leaves others alone", () => {
  const inner = new Error("x");
  expect(unwrapAngularError({ rejection: "denied" })).toBe("denied");
  expect(unwrapAngularError({ ngOriginalError: inner })).toBe(inner);
  expect(unwrapAngularError(inner)).toBe(inner);
  expect(unwrapAngularError(null)).toBeNull();
});

it("records NavigationEnd events as page views and stops when asked", () => {
  const lens = fakeLens();
  const router = fakeRouter();
  const stop = trackAngularRouter(router, lens);
  router.emit({ type: 0, id: 1, url: "/orders" });
  router.emit({ type: 4, id: 1, url: "/orders", urlAfterRedirects: "/orders/all", state: {} });
  router.emit({ type: 1, id: 1, url: "/orders", urlAfterRedirects: "/orders/all" });
  expect(lens.pageView).toHaveBeenCalledTimes(1);
  expect(lens.pageView).toHaveBeenCalledWith("/orders/all");
  stop();
  expect(router.subscribers.size).toBe(0);
});

it("knows NavigationEnd on Angular versions without event types", () => {
  expect(isNavigationEnd({ id: 1, url: "/a", urlAfterRedirects: "/b" })).toBe(true);
  expect(isNavigationEnd({ id: 1, url: "/a", urlAfterRedirects: "/b", state: {} })).toBe(false);
  expect(isNavigationEnd({ id: 1, url: "/a" })).toBe(false);
  expect(isNavigationEnd(null)).toBe(false);
});

it("does nothing when WizeLens is off, or outside a browser", () => {
  const router = fakeRouter();
  trackAngularRouter(router, fakeLens(false));
  expect(router.subscribers.size).toBe(0);
  const handler = createWizeLensErrorHandler({ endpoint: "/_wizelens" });
  expect(() => handler.handleError(new Error("server render"))).not.toThrow();
});
