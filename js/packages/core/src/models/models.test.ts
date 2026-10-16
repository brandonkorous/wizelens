import { describe, expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { isPageName, modelInput, PAGE_MODELS, type PageName } from "./index.js";

const NOW = 1_700_000_100_000;
const traces = [
  ...Array.from({ length: 6 }, (_, i) =>
    makeRequest({ startMs: NOW - 60_000 * (i + 1), path: `/api/orders/${i}`, route: "/api/orders/{id}", queries: Array.from({ length: 6 }, () => ({ sql: "SELECT * FROM items WHERE id = @p0", ms: 3 })) }),
  ),
  makeRequest({ startMs: NOW - 30_000, path: "/api/pay", status: 500, error: { type: "TimeoutError", message: "bank did not answer" } }),
  makeRequest({ startMs: NOW - 26 * 60 * 60_000, path: "/api/old" }),
];
const input = (params: Record<string, string> = {}) => modelInput(traces, "24h", NOW, { slowQueryMs: 100 }, params);

describe("page models", () => {
  it("every model runs and survives JSON, so a server can send it", () => {
    for (const page of Object.keys(PAGE_MODELS) as PageName[]) {
      const model = PAGE_MODELS[page](input());
      expect(JSON.parse(JSON.stringify(model))).toEqual(model);
      expect(isPageName(page)).toBe(true);
    }
  });

  it("splits the window from the one before it", () => {
    const i = input();
    expect(i.traces).toHaveLength(7);
    expect(i.prevTraces).toHaveLength(1);
    expect(PAGE_MODELS.overview(i).meta).toMatchObject({ compareLabel: "vs. previous day", hasPrev: true });
  });

  it("filters, sorts, and pages requests from parameters", () => {
    const m = PAGE_MODELS.requests(input({ status: "5xx", trace: traces[6]!.traceId }));
    expect(m.total).toBe(1);
    expect(m.rows[0]!.path).toBe("/api/pay");
    expect(m.selected?.traceId).toBe(traces[6]!.traceId);
    const paged = PAGE_MODELS.requests(input({ sort: "path", desc: "0", size: "5", page: "2" }));
    expect(paged).toMatchObject({ total: 7, page: 2, pageSize: 5 });
    expect(paged.rows).toHaveLength(2);
  });

  it("finds the N+1 and the error", () => {
    expect(PAGE_MODELS.database(input()).insights.some((g) => g.kind === "n+1-db")).toBe(true);
    const errors = PAGE_MODELS.errors(input());
    expect(errors.groups[0]).toMatchObject({ type: "TimeoutError", count: 1 });
    expect(errors.cards.exceptions).toBe(1);
  });

  it("selects a service and fills its detail", () => {
    const m = PAGE_MODELS.services(input({ service: "api" }));
    expect(m.selected?.row.name).toBe("api");
    expect(m.selected?.endpoints.length).toBeGreaterThan(0);
  });
});
