import { describe, expect, it } from "vitest";
import { toSpan, writesFromSpans } from "./spans.js";

const ids = { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331" };
const attr = (key: string, value: string) => ({ key, value: { stringValue: value } });

describe("OTLP span category", () => {
  it("makes a db span from the operation and table alone", () => {
    const s = toSpan({ ...ids, name: "db findOne session", kind: 1, attributes: [attr("db.operation.name", "findOne"), attr("db.collection.name", "session")] }, "auth", []);
    expect(s?.category).toBe("db");
  });

  it("keeps a messaging span as messaging when it also names a table", () => {
    const s = toSpan({ ...ids, name: "send", kind: 4, attributes: [attr("messaging.system", "kafka"), attr("db.collection.name", "x")] }, "q", []);
    expect(s?.category).toBe("messaging");
  });
});

describe("OTLP service version", () => {
  it("puts the resource's service.version on every span that has none", () => {
    const resource = { attributes: [attr("service.name", "pay"), attr("service.version", "2.0.0")] };
    const spans = [{ ...ids, name: "a", kind: 2 }, { ...ids, spanId: "c7ad6b7169203331", name: "b", kind: 1, attributes: [attr("service.version", "1.9.0")] }];
    const [w] = writesFromSpans([{ resource, scopeSpans: [{ spans }] }], []);
    expect(w!.spans.map((s) => s.attributes["service.version"])).toEqual(["2.0.0", "1.9.0"]);
  });
});
