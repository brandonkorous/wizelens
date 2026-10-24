import { describe, expect, it } from "vitest";
import { ATTR_BROWSER_BOT, ATTR_BROWSER_TYPE } from "./attributes.js";
import { isBotUserAgent } from "./bots.js";
import { redactValue } from "./redact.js";
import { serviceFacts } from "./scale/facts-services.js";
import { errorEvents } from "./stats/errors.js";
import { serviceRows } from "./stats/services.js";
import { makeRequest, makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";

const GOOGLEBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130.0 Safari/537.36";

describe("bots and third parties", () => {
  it("knows crawler user agents, not browsers", () => {
    expect(isBotUserAgent(GOOGLEBOT)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0 Safari/537.36")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0 Safari/537.36")).toBe(false);
  });

  it("keeps a bot's browser spans out of the Web App row and its stats", () => {
    const bot = makeRequest({ fetchMs: 3000, attributes: { "user_agent.original": GOOGLEBOT } });
    const tagged = makeRequest({ fetchMs: 3000 });
    tagged.spans.find((s) => s.category === "browser")!.attributes[ATTR_BROWSER_BOT] = true;
    const person = makeRequest({ fetchMs: 40 });
    const web = serviceRows([bot, tagged, person]).find((r) => r.kind === "web")!;
    expect(web.requests).toBe(1);
    expect([bot, tagged].flatMap((t) => serviceFacts(t)).filter((c) => c.key.startsWith("web:"))).toEqual([]);
  });

  it("keeps one span per span id in a trace", () => {
    const s = makeSpan({ traceId: "c".repeat(32), category: "internal", spanId: "cd3e967cba74f006" });
    expect(buildTrace(s.traceId, [s, { ...s, durationMs: 3000 }], [], []).spanCount).toBe(1);
  });

  it("marks a browser error thrown only by another site's script as third-party, not critical", () => {
    const stack = "TypeError: pa\n    at https://accounts.google.com/gsi/client:2:100\n    at https://accounts.google.com/gsi/client:3:7";
    const attributes = { [ATTR_BROWSER_TYPE]: "error", "url.full": "https://sparx.works/sign-in" };
    const ex = { name: "exception", timeMs: 1, attributes: { "exception.type": "TypeError", "exception.message": "pa", "exception.stacktrace": stack } };
    const err = makeSpan({ traceId: "d".repeat(32), category: "browser", service: "browser", status: "error", attributes, events: [ex] });
    const [e] = errorEvents([buildTrace(err.traceId, [err], [], [])]);
    expect(e).toMatchObject({ critical: false, tags: ["third-party"] });
  });

  it("does not take request, trace, or span ids for card numbers", () => {
    for (const key of ["wizelens.request.id", "trace_id", "span.id"]) expect(redactValue(key, "4111111111111111")).toBe("4111111111111111");
  });
});
