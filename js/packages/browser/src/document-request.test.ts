import { afterEach, expect, it, vi } from "vitest";
import { whenPainted } from "./document-request.js";

type Listener = (list: { getEntries(): PerformanceEntryList }) => void;
let emit: (entries: object[]) => void = () => {};
let disconnected = false;

class FakeObserver {
  static supportedEntryTypes = ["paint"];
  constructor(private readonly listener: Listener) {
    emit = (entries) => this.listener({ getEntries: () => entries as PerformanceEntryList });
  }
  observe() {}
  disconnect() {
    disconnected = true;
  }
}

afterEach(() => vi.unstubAllGlobals());

it("reports the page's render time once its first paint lands, measured from the first byte", () => {
  vi.stubGlobal("PerformanceObserver", FakeObserver);
  vi.stubGlobal("performance", { getEntriesByType: () => [{ startTime: 0, responseStart: 306 }] });
  const seen: number[] = [];
  whenPainted((ms) => seen.push(ms));
  emit([{ name: "first-paint", startTime: 400 }]);
  expect(seen).toEqual([]);
  emit([{ name: "first-contentful-paint", startTime: 416 }]);
  emit([{ name: "first-contentful-paint", startTime: 500 }]);
  expect(seen).toEqual([110]);
  expect(disconnected).toBe(true);
});
