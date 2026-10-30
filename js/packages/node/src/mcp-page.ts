import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AlertChannel, AlertRule, PageName } from "@wizeworks/lens-core/internal";
import { z } from "zod";
import { json, type McpAlerts, READ_ONLY, type Source } from "./mcp-shared.js";
import { rangeArg } from "./mcp-store.js";

/** The dashboard pages an agent may read, with what each holds and the parameters it takes. */
export const MCP_PAGES = {
  overview: "Headlines, charts, top errors, insights, and services. service: a service name.",
  services: "Every service with status, traffic, errors, and latency. service: the selected row.",
  service: "One service: endpoints, dependencies, versions, and errors. service (required): a name; eppage, epsize, epsort (count, errors, avg) for endpoints; errpage, errsize, errsort (count, seen) for errors.",
  endpoint: "One endpoint: latency, errors, slowest requests, users affected. service, endpoint (\"GET /api/orders/{id}\"), both required; qpage/qsize/qsort, callpage/callsize/callsort (count, avg, errors), errpage/errsize/errsort (count, seen) page its lists.",
  requests: "Request list with totals. method, status (5xx, 4xx, 200), duration (slow, >1s), service, endpoint, user, q, sort, page, size.",
  traces: "Trace list. status (ok, error), duration, service, q, sort (time, duration), page, size.",
  errors: "Error groups. status (unresolved, resolved, ignored, all), service, type, endpoint, user, critical=1, new=1, q, sort (recent, count), page, size.",
  error: "One error group: occurrences over time, endpoints, users affected, stack trace. group (required): a group key from errors.",
  database: "Queries by shape, slowest and most called, N+1 and slow query counts. service, q, table, operation, database, sort, page, size; tblpage, tblsize, tblsort (queries, avg, rows) for table hotspots.",
  query: "One query shape: calls, latency, endpoints. q (required): the shape from database.",
  insights: "Performance insights (N+1, slow queries, duplicates). area, impact, status, service, endpoint, q, key, sort (impact, title, area, seen, time, last; -seen for most first), page, size.",
  security: "Security risks (OWASP Top 10:2025) with categories. category (A01..A10), severity (error, warning, info), status, release, service, endpoint, q, key, sort (impact, title, owasp, kind, seen, last; -seen for most first), page, size.",
  logs: "Log lines with level counts. level, exact=1, service, category, trace, user, q, page, size.",
  rendering: "Browser page views and components. q; routes: rtpage, rtsize, rtsort (views, render, lcp, ...; -views for most first); components: cmppage, cmpsize, cmpsort (renders, avg, self, total, ...).",
  route: "One browser route. route (required).",
  "log-patterns": "Log lines grouped into patterns, with counts. level, exact=1, service, pattern, origin, patpage, patsize, patsort (count, change; -count for most first).",
  traffic: "Requests, errors, and latency per time bucket and per endpoint. service, endpoint, buckets (16, 24, 48), from, to (ms).",
  problems: "Problems: anomalies grouped with a suspected cause. service, sensitivity (high, medium, low), problem, at, focus.",
  uptime: "Uptime checks: status, response time, incidents. check (one check id).",
  users: "Signed-in users by requests. q, page, size.",
  user: "One user: requests, failures, errors they hit, slowest requests. user (required); reqpage, reqsize for the newest requests; errpage, errsize for the errors.",
} as const satisfies Partial<Record<PageName, string>>;

type McpPage = keyof typeof MCP_PAGES;
const PAGE_NAMES = Object.keys(MCP_PAGES) as [McpPage, ...McpPage[]];

function registerGetPage(server: McpServer, src: Source): void {
  if (!src.defaults.overview) return;
  const inputSchema = {
    ...src.arg,
    page: z.enum(PAGE_NAMES).describe(PAGE_NAMES.map((p) => `${p}: ${MCP_PAGES[p]}`).join(" | ")),
    params: z.record(z.string(), z.string().max(500)).optional().describe("The page's parameters, as listed with `page`. Values are text."),
    range: rangeArg("the page covers"),
  };
  const description = "Read one dashboard page's numbers, the same the dashboard shows, from the whole store. Pick the page and its parameters; for a list, page through with page and size.";
  server.registerTool("get_page", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("get_page", args);
    try {
      return json(await data.page!(args.page, args.range ?? "24h", args.params ?? {}));
    } catch (err) {
      return { ...json({ error: err instanceof Error ? err.message : String(err) }), isError: true };
    }
  });
}

/** Where a rule sends, without the secret part (webhook URLs, routing keys, addresses). */
const channelKinds = (cs: readonly AlertChannel[]) => cs.map((c) => c.kind);

const ruleOf = (r: AlertRule) => {
  const { channels, ...rest } = r;
  return { ...rest, channels: channelKinds(channels) };
};

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function reportOf(a: McpAlerts) {
  const names = new Map(a.rules.map((r) => [r.id, r.name]));
  return {
    firing: a.rules.filter((r) => r.enabled && r.state === "firing").map((r) => r.name),
    rules: a.rules.map((r) => ({ ...ruleOf(r), lastEval: iso(r.lastEvalMs), mutedUntil: iso(r.mutedUntilMs) })),
    events: a.events.map((e) => ({ rule: names.get(e.ruleId) ?? e.ruleId, kind: e.kind, value: e.value, message: e.message, time: iso(e.timeMs) })),
  };
}

function registerGetAlerts(server: McpServer, src: Source): void {
  if (!src.defaults.alerts) return;
  const description = "List alert rules (what each watches, its threshold, and whether it is firing) and the newest alert events. Channel secrets are left out.";
  server.registerTool("get_alerts", { description, inputSchema: { ...src.arg }, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("get_alerts", args);
    return json(reportOf(await data.alerts!()));
  });
}

/** get_page and get_alerts. */
export function registerPageTools(server: McpServer, src: Source): void {
  registerGetPage(server, src);
  registerGetAlerts(server, src);
}
