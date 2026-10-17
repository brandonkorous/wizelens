import { describe, expect, it } from "vitest";
import { keepByRate } from "./sampling.js";

describe("keepByRate", () => {
  it("keeps all at 1 and none at 0", () => {
    expect(keepByRate("0".repeat(24) + "ffffffff", 1)).toBe(true);
    expect(keepByRate("0".repeat(32), 0)).toBe(false);
  });

  it("reads the last 8 hex digits as a share", () => {
    expect(keepByRate("f".repeat(24) + "19999999", 0.1)).toBe(true);
    expect(keepByRate("0".repeat(24) + "1999999a", 0.1)).toBe(false);
  });

  it("keeps about the rate over many ids", () => {
    let kept = 0;
    for (let i = 0; i < 10_000; i++) if (keepByRate((i * 2654435761 >>> 0).toString(16).padStart(32, "0"), 0.25)) kept++;
    expect(kept).toBeGreaterThan(2300);
    expect(kept).toBeLessThan(2700);
  });
});
