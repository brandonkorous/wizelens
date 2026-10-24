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

/** Paths only scanners ask for on these apps: secrets files, WordPress, source control, and leaked logs. */
export const SCANNER_PATH = /(?:^|\/)(?:\.env(?:\.[\w-]+)?$|\.git(?:\/|$)|\.svn\/|\.aws\/|\.ssh\/|\.srcgraph\/|wp-[\w-]+|wordpress\/|xmlrpc\.php$|phpmyadmin|debug\.log$)/i;

const decodeOnce = (path: string): string => path.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/** A path as scanners mean it: percent codes decoded (twice, for `%2500`), control characters such as `%00` dropped, slashes collapsed. */
export const plainPath = (path: string): string => decodeOnce(decodeOnce(path.split("?")[0]!)).replace(/[\u0000-\u001f]/g, "").replace(/\/{2,}/g, "/");

/** True for a path only scanners ask for, also when they hide it with percent codes (`/%00.env.swp`). */
export const isScannerPath = (path: string): boolean => SCANNER_PATH.test(plainPath(path));

/** True when a request came from a bot: its user agent, or a path only scanners ask for. */
export const isBotRequest = (r: { userAgent: string | null; path: string }): boolean => isBotUserAgent(r.userAgent) || isScannerPath(r.path);

/** True when the trace's request came from a bot, by user agent or scanner path (its entry server span). */
export function isBotRequestTrace(trace: Trace): boolean {
  const server = entryServerSpan(trace.spans);
  const path = server?.attributes["url.path"];
  return isBotTrace(trace) || (typeof path === "string" && isScannerPath(path));
}
