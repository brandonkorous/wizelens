import { describe, expect, it } from "vitest";
import { SettleQueue } from "./queue.js";

describe("settle queue", () => {
  it("counts waiting traces, optionally only those written at or before a time", () => {
    const q = new SettleQueue();
    q.touch("p", "a", "prod", 1_000);
    q.touch("p", "b", "dev", 5_000);
    q.touch("other", "c", "prod", 1_000);
    expect(q.count("p")).toBe(2);
    expect(q.count("p", "prod")).toBe(1);
    expect(q.count("p", undefined, 1_000)).toBe(1);
    expect(q.count("p", undefined, 999)).toBe(0);
  });
});
