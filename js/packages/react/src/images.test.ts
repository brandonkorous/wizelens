import { afterEach, expect, it, vi } from "vitest";
import { imageStats, watchImages } from "./images.js";

type Listener = (list: { getEntries(): PerformanceEntryList }) => void;
let emit: (entries: object[]) => void = () => {};

class FakeObserver {
  static supportedEntryTypes = ["resource"];
  constructor(private readonly listener: Listener) {
    emit = (entries) => this.listener({ getEntries: () => entries as PerformanceEntryList });
  }
  observe() {}
  disconnect() {}
}

afterEach(() => vi.unstubAllGlobals());

it("keeps image downloads after the browser's own list is full", () => {
  vi.stubGlobal("PerformanceObserver", FakeObserver);
  vi.stubGlobal("document", { images: [] });
  const watch = watchImages();
  const scripts = Array.from({ length: 300 }, (_, i) => ({ initiatorType: "script", startTime: i, duration: 1 }));
  emit([...scripts, { initiatorType: "img", startTime: 5000, duration: 80 }, { initiatorType: "img", startTime: 100, duration: 999 }]);
  expect(imageStats(4000, watch.downloads()).slowestMs).toBe(80);
  expect(imageStats(9000, watch.downloads()).slowestMs).toBeNull();
  watch.stop();
});
