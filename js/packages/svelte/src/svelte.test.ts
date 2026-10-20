import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WizeLens } from "@wizeworks/lens-browser";
import { createHandleError, handleErrorWithWizeLens, pageViewOnNavigate, routerPath, trackNavigation, trackSvelteKitNavigation } from "./index.js";

function fakeLens(enabled = true): WizeLens {
  return { enabled, recorder: null, sessionId: "s", pageView: vi.fn(), captureError: vi.fn(), setUser: vi.fn(), flush: vi.fn(), shutdown: vi.fn() };
}

function stubWindow(url: string): EventTarget {
  const events = new EventTarget();
  vi.stubGlobal("location", new URL(url));
  vi.stubGlobal("addEventListener", events.addEventListener.bind(events));
  vi.stubGlobal("removeEventListener", events.removeEventListener.bind(events));
  return events;
}

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("sends SvelteKit client errors with their route, then runs the app's own handler", () => {
  const lens = fakeLens();
  const own = vi.fn(() => ({ message: "Sorry" }));
  const handle = createHandleError(own, lens);
  const input = { error: new Error("boom"), event: { route: { id: "/orders/[id]" } }, status: 500, message: "Internal Error" };
  expect(handle(input)).toEqual({ message: "Sorry" });
  expect(lens.captureError).toHaveBeenCalledWith(input.error, { "sveltekit.route": "/orders/[id]", "http.response.status_code": 500 });
  expect(own).toHaveBeenCalledWith(input);
});

it("logs the error like SvelteKit when there is no handler, and skips WizeLens when it is not running", () => {
  const lens = fakeLens();
  createHandleError(undefined, lens)({ error: "bad" });
  expect(lens.captureError).toHaveBeenCalledWith("bad", {});
  expect(console.error).toHaveBeenCalledWith("bad");
  expect(() => handleErrorWithWizeLens({ error: "no lens" })).not.toThrow();
});

it("records client-side navigations as page views, but not the first load", () => {
  const lens = fakeLens();
  let callback: ((nav: { type?: string; to?: { url: URL } | null }) => void) | null = null;
  trackSvelteKitNavigation((cb) => (callback = cb), lens);
  callback!({ type: "enter", to: { url: new URL("http://app.test/") } });
  callback!({ type: "link", to: { url: new URL("http://app.test/orders/7?tab=1") } });
  callback!({ type: "leave", to: null });
  expect(lens.pageView).toHaveBeenCalledTimes(1);
  expect(lens.pageView).toHaveBeenCalledWith("/orders/7?tab=1");
  expect(() => pageViewOnNavigate()({ type: "link", to: { url: new URL("http://app.test/x") } })).not.toThrow();
});

it("tracks back and forward in history mode, and hash changes in hash mode", () => {
  const lens = fakeLens();
  const events = stubWindow("http://app.test/cart?step=2");
  const stop = trackNavigation({ lens });
  events.dispatchEvent(new Event("popstate"));
  expect(lens.pageView).toHaveBeenLastCalledWith("/cart?step=2");
  stop();
  (location as unknown as URL).hash = "#!/orders/7";
  const stopHash = trackNavigation({ lens, mode: "hash" });
  events.dispatchEvent(new Event("hashchange"));
  expect(lens.pageView).toHaveBeenLastCalledWith("/orders/7");
  stopHash();
  events.dispatchEvent(new Event("hashchange"));
  expect(lens.pageView).toHaveBeenCalledTimes(2);
});

it("reads the router path, and does nothing without a running WizeLens", () => {
  stubWindow("http://app.test/");
  expect(routerPath("hash")).toBe("/");
  expect(routerPath()).toBe("/");
  expect(trackNavigation()).toBeTypeOf("function");
  expect(trackNavigation({ lens: fakeLens(false) })).toBeTypeOf("function");
});
