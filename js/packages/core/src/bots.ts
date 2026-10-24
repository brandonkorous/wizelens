// Bots: crawlers, scanners, and driven browsers, told apart at fact time so they do not count as people.
import { ATTR_BROWSER_BOT } from "./attributes.js";
import { entryServerSpan } from "./trace.js";
import type { Span, Trace } from "./types.js";

/** User agents of crawlers, renderers, and scripted clients. */
export const BOT_UA = /bot\b|bot\/|crawler|spider|crawl|slurp|headlesschrome|lighthouse|bingpreview|facebookexternalhit|python-requests|python-urllib|go-http-client|curl\/|wget\/|scrapy|zgrab|masscan|nuclei|httpx/i;

/** True for a crawler or scripted client's user agent. */
export const isBotUserAgent = (ua: string | null | undefined): boolean => !!ua && BOT_UA.test(ua);

const uaOf = (s: Span | undefined): string | null => {
  const v = s?.attributes["user_agent.original"] ?? s?.attributes["http.request.header.user-agent"];
  return typeof v === "string" ? v : null;
};

/** True when the trace's request came from a bot (its entry server span's user agent). */
export const isBotTrace = (trace: Trace): boolean => isBotUserAgent(uaOf(entryServerSpan(trace.spans)));

/** A trace's spans without a bot's browser spans: tagged by the page, or under a request a bot made. */
export function withoutBotBrowser(trace: Trace): Span[] {
  const bot = isBotTrace(trace);
  return trace.spans.filter((s) => s.category !== "browser" || (!bot && s.attributes[ATTR_BROWSER_BOT] !== true));
}
