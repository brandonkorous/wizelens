import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findSecurity, OWASP_OF, type SecurityGroup, securityKeyOf, securityRequest, securityShapeOf, type TimeRange, type Trace } from "@wizeworks/lens-core/internal";
import { z } from "zod";
import { json, type McpDataSource, READ_ONLY, type Source } from "./mcp-shared.js";
import { rangeArg, windowOf } from "./mcp-store.js";

/** One risk as the tool lists it, the same fields as the .NET add-on's tool. */
interface Risk {
  kind: string;
  owasp: string;
  severity: string;
  title: string;
  shape: string;
  endpoints: string[];
  requests: number;
  count: number;
  lastSeen: string;
  exampleTraceId: string | null;
  /** Vulnerable packages only: the advisories, with the versions that fix them. */
  advisories?: { id: string; severity: string; fixed: string[] }[];
}

const RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };
const iso = (ms: number) => new Date(ms).toISOString();

const fromGroup = (g: SecurityGroup): Risk => ({
  kind: g.kind, owasp: g.owasp, severity: g.severity, title: g.title, shape: g.shape, endpoints: g.endpoints.slice(0, 5), requests: g.occurrences, count: g.count, lastSeen: iso(g.lastSeenMs), exampleTraceId: g.exampleTraceId,
  ...(g.advisories ? { advisories: g.advisories.map((a) => ({ id: a.id, severity: a.severity, fixed: a.fixed })) } : {}),
});

/** Without stats: every trace in the range, analyzed in memory and grouped by kind and shape. */
function fromTraces(traces: readonly Trace[]): Risk[] {
  const groups = new Map<string, Risk & { lastMs: number }>();
  for (const t of [...traces].sort((a, b) => a.startMs - b.startMs)) {
    const endpoint = securityRequest(t)?.endpoint ?? t.rootName;
    for (const f of findSecurity(t)) {
      const key = securityKeyOf(f);
      const g = groups.get(key) ?? { kind: f.kind, owasp: OWASP_OF[f.kind as keyof typeof OWASP_OF], severity: f.severity, title: f.title, shape: securityShapeOf(f), endpoints: [], requests: 0, count: 0, lastSeen: "", exampleTraceId: null, lastMs: 0 };
      if (!g.endpoints.includes(endpoint) && g.endpoints.length < 5) g.endpoints.push(endpoint);
      groups.set(key, { ...g, requests: g.requests + 1, count: g.count + f.count, lastSeen: iso(t.startMs), exampleTraceId: t.traceId, lastMs: t.startMs });
    }
  }
  return [...groups.values()].map(({ lastMs: _, ...r }) => r);
}

async function risksOf(data: McpDataSource, range: TimeRange): Promise<Risk[]> {
  if (data.page) return (await data.page("security", range, { status: "all" })).groups.map(fromGroup);
  const w = windowOf(data, range);
  return fromTraces((await data.all()).filter((t) => t.startMs >= w.from && t.startMs < w.to));
}

/** find_security_issues: OWASP Top 10 risks in real requests, the most severe first. */
export function registerSecurityTools(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    severity: z.enum(["error", "warning", "info"]).optional().describe("Lowest severity to list. Default info (all)."),
    limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
    range: rangeArg("to look"),
  };
  const description = "Find security risks (OWASP Top 10:2025) in real requests: SQL built from input, missing security headers, loose CORS, cookies without flags, secrets in URLs and logs, plain HTTP calls, SSRF, open admin routes and sensitive files, stack traces in answers, and repeated failed sign-ins. Grouped by kind and shape, the most severe first. Each one is a hint with an example trace, not proof.";
  server.registerTool("find_security_issues", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("find_security_issues", args);
    const lowest = RANK[args.severity ?? "info"]!;
    const risks = (await risksOf(data, args.range ?? "24h")).filter((r) => RANK[r.severity]! <= lowest);
    return json(risks.sort((a, b) => RANK[a.severity]! - RANK[b.severity]! || b.requests - a.requests).slice(0, args.limit ?? 50));
  });
}
