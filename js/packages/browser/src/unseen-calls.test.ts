import { afterEach, expect, it, vi } from "vitest";
import { unseenCall, watchCalls } from "./unseen-calls.js";

const TRACE = "f831917201c8c71e49b51b60b389c5f7";
const ENDPOINT = new URL("http://localhost:5300/_wizelens/");
const BASE = "http://localhost:5300/";
const timing = (trace: string, endpoint?: string) => [{ name: "wl-trace", description: trace }, ...(endpoint ? [{ name: "wl-endpoint", description: endpoint }] : [])];

const entry = (name: string, initiatorType: string, serverTiming: object[], extra: object = {}) =>
  ({ name, initiatorType, serverTiming, startTime: 120, responseStart: 131, responseStatus: 200, ...extra }) as unknown as PerformanceResourceTiming;

afterEach(() => vi.unstubAllGlobals());

it("makes a HUD row for a traced call, with its trace, status, time and the endpoint that holds it", () => {
  vi.stubGlobal("performance", { timeOrigin: 1_000_000 });
  const call = unseenCall(entry(`${BASE}api/bakeries/dona-ines/orders/2026-10-29?status=open`, "fetch", timing(TRACE, "http://localhost:5301/_wizelens")), ENDPOINT, BASE);
  expect(call?.endpoint).toBe("http://localhost:5301/_wizelens");
  expect(call?.row).toMatchObject({
    id: `early-${TRACE}`, method: "", path: "/api/bakeries/dona-ines/orders/2026-10-29?status=open",
    status: 200, durationMs: 11, startMs: 1_000_120, traceId: TRACE, profiled: true,
  });
});

it("leaves out scripts, untraced calls, WizeLens's own calls, and XHR when XHR capture is off", () => {
  vi.stubGlobal("performance", { timeOrigin: 0 });
  expect(unseenCall(entry(`${BASE}styles.css`, "link", timing(TRACE)), ENDPOINT, BASE)).toBeNull();
  expect(unseenCall(entry(`${BASE}api/untraced`, "fetch", []), ENDPOINT, BASE)).toBeNull();
  expect(unseenCall(entry(`${BASE}_wizelens/api/traces`, "fetch", timing(TRACE)), ENDPOINT, BASE)).toBeNull();
  const xhr = entry(`${BASE}api/products`, "xmlhttprequest", timing(TRACE), { responseStatus: 503 });
  expect(unseenCall(xhr, ENDPOINT, BASE)?.row.status).toBe(503);
  expect(unseenCall(xhr, ENDPOINT, BASE, false)).toBeNull();
});

it("watches resource timing, earlier entries too, and stops", () => {
  let emit: (list: PerformanceResourceTiming[]) => void = () => {};
  let options: PerformanceObserverInit | undefined;
  class FakeObserver {
    static supportedEntryTypes = ["resource"];
    constructor(cb: (list: { getEntries(): PerformanceEntryList }) => void) {
      emit = (list) => cb({ getEntries: () => list });
    }
    observe(o: PerformanceObserverInit) {
      options = o;
    }
    disconnect() {
      emit = () => {};
    }
  }
  vi.stubGlobal("PerformanceObserver", FakeObserver);
  vi.stubGlobal("performance", { timeOrigin: 0 });
  const seen: string[] = [];
  const stop = watchCalls(ENDPOINT, BASE, true, (c) => seen.push(c.row.path));
  emit([entry(`${BASE}api/products/2/related`, "fetch", timing(TRACE)), entry(`${BASE}app.js`, "script", [])]);
  stop();
  emit([entry(`${BASE}api/catalog`, "fetch", timing(TRACE))]);
  expect([seen, options?.buffered]).toEqual([["/api/products/2/related"], true]);
});
