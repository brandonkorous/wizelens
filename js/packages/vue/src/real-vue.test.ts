import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import type { WizeLens as Lens } from "@wizeworks/lens-browser";
import { WizeLensPlugin } from "./index.js";

const fakeLens = (): Lens => ({ enabled: true, recorder: null, sessionId: "s", pageView: vi.fn(), captureError: vi.fn(), setUser: vi.fn(), flush: vi.fn(), shutdown: vi.fn() });

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("real Vue: an error thrown in a component's setup reaches the lens with the component trail", async () => {
  const lens = fakeLens();
  const PriceLine = defineComponent({ name: "PriceLine", setup: () => { throw new Error("price missing"); } });
  const Cart = defineComponent({ name: "Cart", render: () => h(PriceLine) });
  const app = createSSRApp(defineComponent({ name: "App", render: () => h(Cart) }));
  app.use(WizeLensPlugin, { lens });
  await renderToString(app).catch(() => undefined);
  expect(lens.captureError).toHaveBeenCalledTimes(1);
  const [err, attrs] = (lens.captureError as ReturnType<typeof vi.fn>).mock.calls[0]!;
  expect((err as Error).message).toBe("price missing");
  expect(attrs).toMatchObject({ "vue.component": "PriceLine", "vue.component.trail": "App > Cart > PriceLine" });
});

it("real Vue Router: each finished navigation is a page view", async () => {
  const lens = fakeLens();
  const Page = defineComponent({ render: () => h("div") });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: Page }, { path: "/orders/:id", component: Page }] });
  const app = createSSRApp(defineComponent({ render: () => h("div") }));
  app.use(router).use(WizeLensPlugin, { lens, router });
  await router.push("/orders/7");
  expect(lens.pageView).toHaveBeenCalledWith(expect.stringContaining("/orders/7"));
});
