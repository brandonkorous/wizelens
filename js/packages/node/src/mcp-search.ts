import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkSearch, decodeCursor, SEARCH_KINDS, searchMemory, suggestMemory } from "@wizeworks/lens-core";
import { z } from "zod";
import { json, READ_ONLY, type Source } from "./mcp-shared.js";
import { RANGES, windowOf } from "./mcp-store.js";

const LANGUAGE = [
  "Search language: words and \"phrases\" match text (path, SQL, messages, errors).",
  "field:value with service, env, trace, span, name, method, path, route, status (500, 5xx, ok, error), duration (250ms, 1s), level, category, kind, user, error (true/false), message.",
  "@attribute:value for any span or log attribute, such as @user.id:42 or @db.system.name:postgres.",
  "Use >, >=, <, <= (status:>=500, duration:>1s), ranges a..b, * wildcards (path:/api/*), -term or NOT to exclude, OR, and parentheses.",
].join(" ");

function registerSearch(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    q: z.string().max(2000).describe("The search. Empty finds everything in the range."),
    kind: z.enum(SEARCH_KINDS as [string, ...string[]]).optional().describe("What to find: requests (default), traces, spans, or logs."),
    range: z.enum(RANGES).optional().describe("How far back: 15m, 1h, 6h, 24h (default), 7d, 30d."),
    limit: z.number().int().min(1).max(200).optional().describe("Results per page. Default 20."),
    cursor: z.string().optional().describe("The `next` value of the last page, for the next page."),
  };
  const description = `Search requests, traces, spans, and logs, newest first. ${LANGUAGE}`;
  server.registerTool("search", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("search", args);
    const parsed = checkSearch(args.q);
    if (!parsed.ok) return { ...json({ error: parsed.error, start: parsed.start, end: parsed.end }), isError: true };
    const q = { kind: (args.kind ?? "requests") as (typeof SEARCH_KINDS)[number], node: parsed.node, window: windowOf(data, args.range ?? "24h"), limit: args.limit ?? 20, cursor: decodeCursor(args.cursor), env: data.env };
    return json(await (data.search ? data.search(q) : searchMemory(await data.all(), q)));
  });
}

function registerFields(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    field: z.string().max(200).optional().describe("Leave out to list fields and attribute keys; or a field (service) or attribute (@user.id) to list its common values."),
    prefix: z.string().max(200).optional().describe("Only names or values that start with this."),
    range: z.enum(RANGES).optional().describe("Which data to read. Default 24h."),
  };
  const description = "List search fields, attribute keys seen in the data, or the common values of one field, to build a search.";
  server.registerTool("search_fields", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("search_fields", args);
    const r = { field: args.field || null, prefix: args.prefix ?? "", window: windowOf(data, args.range ?? "24h"), limit: 50, env: data.env };
    return json(await (data.suggest ? data.suggest(r) : suggestMemory(await data.all(), r)));
  });
}

/** search and search_fields: the search language, on the host's store or on `all()` in memory. */
export function registerSearchTools(server: McpServer, src: Source): void {
  registerSearch(server, src);
  registerFields(server, src);
}
