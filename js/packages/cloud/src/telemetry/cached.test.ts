import { describe, expect, it } from "vitest";
import { memo } from "./cached.js";

describe("memo", () => {
  it("shares one call per key, keeps it for the ttl, and drops failures", async () => {
    let clock = 0;
    let calls = 0;
    let fail = false;
    const m = memo(async (k) => (calls++, fail ? Promise.reject(new Error("x")) : `${k}${calls}`), () => clock, 1000);
    expect(await Promise.all([m.get("a"), m.get("a")])).toEqual(["a1", "a1"]);
    clock = 999;
    expect(await m.get("a")).toBe("a1");
    clock = 1000;
    expect(await m.get("a")).toBe("a2");
    fail = true;
    await expect(m.get("b")).rejects.toThrow("x");
    fail = false;
    expect(await m.get("b")).toBe("b4");
    m.drop("a");
    expect(await m.get("a")).toBe("a5");
  });
});
