import { describe, expect, it } from "vitest";
import { VERSION_ATTR } from "@wizeworks/lens-core/internal";
import { parseIngest } from "./ingest.js";
import { writesFromSpans } from "./otlp/spans.js";
import { span, T1 } from "./test/helpers.js";

describe("versions at ingest", () => {
  it("puts the sender's version on its own spans", () => {
    const w = parseIngest({ sender: { service: "orders-api", version: "0.3.0", release: "2.1.0" }, spans: [span(T1, "1".repeat(16)), span(T1, "2".repeat(16), { service: "other" })] }, []);
    expect(w!.spans.map((s) => s.attributes[VERSION_ATTR] ?? null)).toEqual(["2.1.0", null]);
  });

  it("takes the version of an OpenTelemetry resource", () => {
    const resource = { attributes: [{ key: "service.name", value: { stringValue: "pay" } }, { key: "service.version", value: { stringValue: "3.0" } }] };
    const otlp = { traceId: T1, spanId: "1".repeat(16), name: "GET /pay", kind: 2, startTimeUnixNano: "1000000000", endTimeUnixNano: "2000000000" };
    const [w] = writesFromSpans([{ resource, scopeSpans: [{ spans: [otlp] }] }], []);
    expect(w!.spans[0]!.attributes[VERSION_ATTR]).toBe("3.0");
  });
});
