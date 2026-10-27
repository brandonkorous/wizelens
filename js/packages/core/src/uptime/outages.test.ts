import { describe, expect, it } from "vitest";
import { outagesIn } from "./outages.js";
import type { UptimeIncidentView } from "./views.js";

const at = (startMs: number, endMs: number | null, id = String(startMs)): UptimeIncidentView => ({ id, checkId: "c1", checkName: "kanNINJA API health", startMs, endMs, reason: "ECONNREFUSED" });

describe("outagesIn", () => {
  it("keeps the outages that overlap the window, oldest first, and one still going", () => {
    const list = [at(900, null), at(50, 150), at(10, 40), at(500, 620)];
    expect(outagesIn(list, 100, 1000).map((i) => i.id)).toEqual(["50", "500", "900"]);
  });

  it("leaves out one that ended as the window began", () => {
    expect(outagesIn([at(10, 100)], 100, 1000)).toEqual([]);
  });
});
