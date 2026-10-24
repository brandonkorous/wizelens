import { describe, expect, it } from "vitest";
import { metricValue } from "../anomaly/baseline.js";
import { emptyAgg } from "../scale/agg.js";
import { serviceFacts } from "../scale/facts-services.js";
import { makeRequest } from "../testing/fixtures.js";
import { errorEvents, errorGroupLabel, errorGroups } from "./errors.js";

const fail = (path: string, ua = "Mozilla/5.0 Chrome/155.0") => makeRequest({ path, status: 500, error: { type: "Error", message: "ENOENT" }, attributes: { "user_agent.original": ua } });

describe("bot and scanner traffic", () => {
  it("makes scanner errors bot-only, not critical", () => {
    const [g] = errorGroups(errorEvents([fail("/wp-content/debug.log"), fail("/.env", "zgrab/0.x")]));
    expect(g).toMatchObject({ critical: false, bots: 2, count: 2 });
    expect(errorGroupLabel(g!)).toBe("Bot-only");
    const [real] = errorGroups(errorEvents([fail("/api/orders")]));
    expect(real).toMatchObject({ critical: true, bots: 0 });
  });

  it("counts bot requests apart, and request-count anomalies leave them out", () => {
    const bot = serviceFacts(fail("/.env")).find((c) => c.kind === "svc.ep")!;
    const person = serviceFacts(fail("/api/orders")).find((c) => c.kind === "svc.ep")!;
    expect([bot.c, person.c]).toEqual([[1], [0]]);
    const agg = { ...emptyAgg(), n: 36, c: [35] };
    expect(metricValue("requests", agg)).toBe(1);
  });
});
