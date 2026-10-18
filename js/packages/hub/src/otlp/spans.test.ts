import { describe, expect, it } from "vitest";
import { toSpan } from "./spans.js";

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
