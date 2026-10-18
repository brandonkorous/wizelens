import { SpanKind } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";
import { toContractSpan } from "./processor.js";

const readable = (attributes: Record<string, string>): ReadableSpan =>
  ({
    name: "db findOne session",
    kind: SpanKind.INTERNAL,
    attributes,
    events: [],
    status: { code: 0 },
    startTime: [1, 0],
    duration: [0, 1_000_000],
    spanContext: () => ({ traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 }),
  }) as unknown as ReadableSpan;

describe("toContractSpan", () => {
  it("makes a db span from a library that sends only the operation and table", () => {
    const span = toContractSpan(readable({ "db.operation.name": "findOne", "db.collection.name": "session" }), "console", []);
    expect(span.category).toBe("db");
  });

  it("leaves a plain span internal", () => {
    expect(toContractSpan(readable({ "http.route": "/get-session" }), "console", []).category).toBe("internal");
  });
});
