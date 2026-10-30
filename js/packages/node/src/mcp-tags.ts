import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { activeTags, itemOwner, matchKey, matchTags, type SearchPage, type SearchQuery, searchMemory, type TagMatches } from "@wizeworks/lens-core/internal";
import { json, type McpDataSource, READ_ONLY, type Source, tagsOf } from "./mcp-shared.js";

// Tags for AI tools (docs/TAGS-PLAN.md): the project's tag rules, and which of them match a page of search results.

/** Runs one search page on the host's store, or in memory. */
const runnerOf = (data: McpDataSource) => async (q: SearchQuery): Promise<SearchPage> => (data.search ? data.search(q) : searchMemory(await data.all(), q));

/** The tags on each result of a page, keyed by "traceId owner" as `api/tags/match` answers. */
async function pageTags(data: McpDataSource, page: SearchPage): Promise<TagMatches> {
  const items = page.items.map((item) => {
    const r = item as { traceId: string; startMs?: number; timeMs?: number };
    return { traceId: r.traceId, owner: itemOwner(page.kind, item), timeMs: r.startMs ?? r.timeMs ?? 0 };
  });
  return matchTags(runnerOf(data), page.kind, items, activeTags(await tagsOf(data)), data.env);
}

/** The page with each result's matching tag rules merged into its own `tags`. */
export async function withPageTags(data: McpDataSource, page: SearchPage): Promise<SearchPage> {
  const matches = await pageTags(data, page);
  const items = page.items.map((item) => {
    const own = (item as { tags?: unknown }).tags;
    const found = matches[matchKey((item as { traceId: string }).traceId, itemOwner(page.kind, item))] ?? [];
    return { ...item, tags: [...new Set([...(Array.isArray(own) ? own : []), ...found])] };
  });
  return { ...page, items } as SearchPage;
}

/** list_tags: the tags `tag:name` reads, with their searches. */
export function registerTagTools(server: McpServer, src: Source): void {
  const description = "List the project's tags: built-in and custom tag rules, each a name for a search. Use tag:name in search, list_traces q, or anything that takes a search.";
  server.registerTool("list_tags", { description, inputSchema: { ...src.arg }, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("list_tags", args);
    return json((await tagsOf(data)).map(({ name, query, builtIn, enabled }) => ({ name, query, builtIn, enabled })));
  });
}
