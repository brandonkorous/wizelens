import type { DatabaseSync } from "node:sqlite";
import { logSearchHref, type SavedItem } from "@wizeworks/lens-core";

// Hub schema 5: log searches from the old saved_searches table become saved searches charted on the Logs page; the table goes.
interface OldRow {
  id: string;
  project: string;
  name: string;
  params: string;
  created_ms: number;
}

const paramsOf = (json: string): Record<string, string> => {
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
};

/** The saved item an old log search becomes: shared, as every hub item is, and drawn as a chart. */
export const itemOfOldSearch = (r: OldRow): SavedItem => ({
  id: r.id,
  projectId: r.project,
  kind: "search",
  name: r.name,
  href: logSearchHref(paramsOf(r.params)),
  panels: [],
  chart: true,
  shared: true,
  owner: "",
  ownerName: "",
  createdMs: r.created_ms,
  updatedMs: r.created_ms,
});

/** Move every old log search into `saved`, then drop `saved_searches`. Nothing to do when the table is gone. */
export function moveSavedSearches(db: DatabaseSync): void {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'saved_searches'").get()) return;
  const rows = db.prepare("SELECT id, project, name, params, created_ms FROM saved_searches ORDER BY created_ms, id").all() as unknown as OldRow[];
  const insert = db.prepare("INSERT INTO saved (id, project, kind, json, created_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING");
  db.exec("BEGIN");
  try {
    for (const item of rows.map(itemOfOldSearch)) insert.run(item.id, item.projectId, item.kind, JSON.stringify(item), item.createdMs);
    db.exec("DROP TABLE saved_searches");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
