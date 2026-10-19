import type { ServerResponse } from "node:http";
import { activeTags, matchTags, searchMemory, TAG_LIMITS, tagMatchRequestOf, type TagRule } from "@wizeworks/lens-core";
import { readJson, sendJson } from "./http-util.js";
import type { TraceStore } from "./store.js";
import type { Req } from "./types.js";

// The in-app tags API (docs/TAGS-PLAN.md): the rules from the `tags` option, read-only, and which of them match a page of rows.

/** `GET api/tags`. Rules live in code here, so the dashboard shows them without edit controls. */
export function sendTags(tags: readonly TagRule[], res: ServerResponse): void {
  sendJson(res, 200, { tags, editable: false, max: TAG_LIMITS.rules });
}

/** `POST api/tags/match` with `{ kind, items }`: each enabled rule runs as a search over these traces in memory. */
export async function sendTagMatch(store: TraceStore, tags: readonly TagRule[], req: Req, res: ServerResponse, env?: string): Promise<void> {
  const r = tagMatchRequestOf(await readJson(req).catch(() => null));
  if (!r.ok) return sendJson(res, 400, r);
  const traces = store.all();
  sendJson(res, 200, { matches: await matchTags((q) => searchMemory(traces, q), r.kind, r.items, activeTags(tags), env) });
}
