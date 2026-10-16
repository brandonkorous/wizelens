import { describe, expect, it } from "vitest";
import { parseIngest } from "./ingest.js";
import { span, T1 } from "./test/helpers.js";

describe("parseIngest", () => {
  it("needs a sender with a service name", () => {
    expect(parseIngest({ spans: [] }, [])).toBeNull();
    expect(parseIngest({ sender: { service: "" } }, [])).toBeNull();
  });

  it("drops bad items and redacts the rest", () => {
    const good = span(T1, "1".repeat(16), { attributes: { "http.request.header.authorization": "Bearer x" } });
    const w = parseIngest(
      {
        sender: { service: "api", project: "shop", endpoint: "http://localhost:5100/_wizelens/" },
        spans: [good, { traceId: "nope" }],
        logs: [{ traceId: T1, log: { message: "m", level: "loud", timeMs: 5 } }, { traceId: "x" }],
        remotes: [{ traceId: T1, endpoint: "javascript:alert(1)" }, { traceId: T1, endpoint: "http://other/_wizelens" }],
      },
      ["authorization"],
    )!;
    expect(w.sender).toMatchObject({ service: "api", project: "shop", endpoint: "http://localhost:5100/_wizelens" });
    expect(w.spans).toHaveLength(1);
    expect(w.spans[0]!.attributes["http.request.header.authorization"]).toBe("[redacted]");
    expect(w.logs).toEqual([{ traceId: T1, log: expect.objectContaining({ level: "info", service: "api", message: "m" }) }]);
    expect(w.remotes).toEqual([{ traceId: T1, endpoint: "http://other/_wizelens" }]);
  });
});
