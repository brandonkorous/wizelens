import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ATTR_ERROR_FRAME, ATTR_SERVICE_VERSION, type Span } from "@wizeworks/lens-core/internal";
import { CART_STACK, cartLoader } from "../../core/src/testing/sourcemap.js";
import { errorSpan } from "./errors.js";
import { injectedRelease, sendError } from "./error-frames.js";
import { createSender } from "./sender.js";
import { stubPage } from "./test-env.js";

beforeEach(stubPage);
afterEach(() => vi.unstubAllGlobals());

const view = { traceId: "a".repeat(32), spanId: "b".repeat(16), route: "/checkout", url: "https://app.test/checkout" };
const err = { type: "Error", message: "Coupon code is empty", stack: CART_STACK };

function capture() {
  const sent: Span[] = [];
  const send = (async (_url: string, init?: RequestInit) => {
    sent.push(...(JSON.parse(String(init!.body)) as { spans: Span[] }).spans);
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  return { sent, send };
}

it("holds an error until its group frame is added, and stamps the version on every span", async () => {
  const { sent, send } = capture();
  const sender = createSender("https://app.test/_wizelens", () => send, undefined, "3.1.0");
  sendError(sender, errorSpan(view, err, "s"), cartLoader);
  await vi.waitFor(async () => {
    await sender.flush(false);
    expect(sent).toHaveLength(1);
  });
  const ex = sent[0]!.events[0]!;
  expect(ex.attributes[ATTR_ERROR_FRAME]).toBe("src/cart.ts:applyCoupon");
  expect(ex.attributes["exception.stacktrace"]).toBe(CART_STACK);
  expect(sent[0]!.attributes[ATTR_SERVICE_VERSION]).toBe("3.1.0");
});

it("sends at once without a loader, and reads the release the build plugin set", async () => {
  const { sent, send } = capture();
  const sender = createSender("https://app.test/_wizelens", () => send);
  sendError(sender, errorSpan(view, err, "s"), null);
  await sender.flush(false);
  expect(sent[0]!.events[0]!.attributes[ATTR_ERROR_FRAME]).toBeUndefined();
  expect(sent[0]!.attributes[ATTR_SERVICE_VERSION]).toBeUndefined();
  expect(injectedRelease()).toBeNull();
  vi.stubGlobal("__WIZELENS_RELEASE__", "9.9.9");
  expect(injectedRelease()).toBe("9.9.9");
});
