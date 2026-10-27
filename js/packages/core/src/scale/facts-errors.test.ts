import { describe, expect, it } from "vitest";
import { ATTR_BROWSER_TYPE } from "../attributes.js";
import { makeSpan } from "../testing/fixtures.js";
import { buildTrace } from "../trace.js";
import { errorFacts } from "./facts-errors.js";
import { splitKey } from "./kinds.js";

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

describe("errors by browser", () => {
  it("counts a browser error under the browser on its own span, with no request", () => {
    const ex = { name: "exception", timeMs: 5, attributes: { "exception.type": "ApiClientError", "exception.message": "Validation failed" } };
    const err = makeSpan({ traceId: "e".repeat(32), category: "browser", service: "browser", status: "error", attributes: { [ATTR_BROWSER_TYPE]: "error", "user_agent.original": SAFARI }, events: [ex] });
    const facts = errorFacts(buildTrace(err.traceId, [err], [], []));
    expect(facts.filter((c) => c.kind === "err.b").map((c) => splitKey(c.key)[1])).toEqual(["Safari on iOS"]);
  });

  it("adds no browser row when nothing names one", () => {
    const err = makeSpan({ category: "browser", service: "browser", status: "error", attributes: { [ATTR_BROWSER_TYPE]: "error" } });
    expect(errorFacts(buildTrace(err.traceId, [err], [], [])).some((c) => c.kind === "err.b")).toBe(false);
  });
});
