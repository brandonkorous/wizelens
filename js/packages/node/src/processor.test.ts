import { SpanKind } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core";
import { StoreSpanProcessor, toContractSpan } from "./processor.js";
import type { TraceStore } from "./store.js";
import { serviceVersionOf } from "./tracing.js";

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

describe("StoreSpanProcessor", () => {
  it("keeps the app's version on spans that do not set one", () => {
    const added: Span[] = [];
    const store = { addSpan: (s: Span) => void added.push(s) } as unknown as TraceStore;
    new StoreSpanProcessor(store, "api", [], "2.0.0").onEnd(readable({}));
    new StoreSpanProcessor(store, "api", [], "2.0.0").onEnd(readable({ "service.version": "1.0.0" }));
    new StoreSpanProcessor(store, "api", []).onEnd(readable({}));
    expect(added.map((s) => s.attributes["service.version"])).toEqual(["2.0.0", "1.0.0", undefined]);
  });

  it("reads the version from the option, then OTEL_SERVICE_VERSION", () => {
    expect(serviceVersionOf({ serviceVersion: "3.1.0" })).toBe("3.1.0");
    process.env.OTEL_SERVICE_VERSION = "4.0.0";
    expect(serviceVersionOf({})).toBe("4.0.0");
    delete process.env.OTEL_SERVICE_VERSION;
  });
});
