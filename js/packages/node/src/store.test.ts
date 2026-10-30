import { describe, expect, it } from "vitest";
import { newTraceId } from "@wizeworks/lens-core/internal";
import { TraceStore } from "./internal.js";
import { fakeSpan } from "./test/helpers.js";

describe("TraceStore", () => {
  it("drops the oldest traces past the limit", () => {
    const store = new TraceStore({ maxTraces: 2 });
    const ids = [newTraceId(), newTraceId(), newTraceId()];
    ids.forEach((id, i) => store.addSpan(fakeSpan(id, Date.now() + i)));
    expect(store.size).toBe(2);
    expect(store.get(ids[0]!)).toBeUndefined();
    expect(store.list().map((t) => t.traceId)).toEqual([ids[2], ids[1]]);
  });

  it("drops traces past the max age", () => {
    let clock = 1_000_000;
    const store = new TraceStore({ maxAgeMs: 1000, now: () => clock });
    const old = newTraceId();
    const fresh = newTraceId();
    store.addSpan(fakeSpan(old, clock - 5000));
    store.addSpan(fakeSpan(fresh, clock - 10));
    expect(store.list().map((t) => t.traceId)).toEqual([fresh]);
    clock += 2000;
    expect(store.list()).toEqual([]);
  });

  it("filters by browser session", () => {
    const store = new TraceStore();
    const mine = newTraceId();
    const other = newTraceId();
    store.addSpan(fakeSpan(mine, Date.now(), { "wizelens.browser.session": "tab-1" }));
    store.addSpan(fakeSpan(other, Date.now(), { "wizelens.browser.session": "tab-2" }));
    store.addSpan(fakeSpan(mine, Date.now() + 1));
    expect(store.list(50, "tab-1").map((t) => t.traceId)).toEqual([mine]);
    expect(store.list(50).length).toBe(2);
  });
});
