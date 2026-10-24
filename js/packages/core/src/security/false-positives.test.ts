import { describe, expect, it } from "vitest";
import { findNPlusOneDb } from "../analysis.js";
import { makeRequest, makeSpan } from "../testing/fixtures.js";
import { buildTrace } from "../trace.js";
import { findSecretLeaks } from "./leaks.js";

describe("security false positives", () => {
  it("does not call a marker in the baggage header a card number in span data", () => {
    const s = makeSpan({ traceId: "b".repeat(32), category: "http.server", attributes: { "http.request.header.baggage": "sentry-sample_rand=0.[redacted:card]" } });
    expect(findSecretLeaks(buildTrace(s.traceId, [s], [], []))).toEqual([]);
  });

  it("names a set_config preamble per transaction as session setup, not an N+1", () => {
    const t = makeRequest({ queries: Array.from({ length: 6 }, () => ({ sql: "select set_config('app.tenant', $1, true)", ms: 1 })) });
    const [f] = findNPlusOneDb(t, 5);
    expect(f).toMatchObject({ kind: "n+1-db", severity: "info" });
    expect(f!.title).toContain("Session setup (set_config)");
  });
});
