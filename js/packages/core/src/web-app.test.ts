import { describe, expect, it } from "vitest";
import { ATTR_BROWSER_APP, ATTR_BROWSER_TYPE } from "./attributes.js";
import { errorEvents } from "./stats/errors.js";
import { logRows } from "./stats/logs.js";
import { serviceRows } from "./stats/services.js";
import { makeRequest, makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";
import type { Trace } from "./types.js";
import { isWebAppName, rawService, webAppName } from "./web-app.js";

const fromApp = (app: string | null): Trace => {
  const t = makeRequest({ fetchMs: 30 });
  if (app) t.spans.find((s) => s.service === "browser")!.attributes[ATTR_BROWSER_APP] = app;
  return t;
};

describe("browser app names", () => {
  it("name a browser app by its own name, and keep \"Web App\" for one without", () => {
    expect(webAppName("piggles-web")).toBe("piggles-web (browser)");
    expect(webAppName("api (browser)")).toBe("api (browser)");
    expect(webAppName(null)).toBe("Web App");
    expect(isWebAppName("piggles-web (browser)") && isWebAppName("Web App") && !isWebAppName("api")).toBe(true);
    expect(rawService("piggles-web (browser)")).toBe("browser");
  });

  it("give each named app its own Services row; old spans stay \"Web App\"", () => {
    const web = serviceRows([fromApp("piggles-web"), fromApp(null)]).filter((r) => r.kind === "web");
    expect(web.map((r) => [r.key, r.name]).sort()).toEqual([["web:browser", "Web App"], ["web:piggles-web", "piggles-web (browser)"]]);
  });

  it("show a named app's errors and console lines under its name", () => {
    const ex = { name: "exception", timeMs: 5, attributes: { "exception.type": "TypeError", "exception.message": "boom" } };
    const attributes = { [ATTR_BROWSER_TYPE]: "error", [ATTR_BROWSER_APP]: "piggles-web" };
    const err = makeSpan({ traceId: "e".repeat(32), category: "browser", service: "browser", status: "error", attributes, events: [ex] });
    const t = buildTrace(err.traceId, [err], [{ timeMs: 5, level: "info", category: "console", message: "hi", service: "browser", spanId: err.spanId, attributes }], []);
    expect(errorEvents([t]).map((e) => e.service)).toEqual(["piggles-web (browser)"]);
    expect(logRows([t]).map((l) => l.service)).toEqual(["piggles-web (browser)"]);
  });
});
