import type { DatabaseSync } from "node:sqlite";

// Trigram indexes (docs/SEARCH-PLAN.md, "Hub"): "contains" searches of 3 or more characters read these, not the whole time window.
const FTS_COLUMNS: Record<string, string> = { fact_search: "text", fact_requests: "search", fact_traces: "search", fact_logs: "search" };

/** An index over `table.col`, kept in step with the table by triggers. */
const ftsSql = (t: string, col: string) => `
CREATE VIRTUAL TABLE IF NOT EXISTS ${t}_fts USING fts5(${col}, content='${t}', content_rowid='rowid', tokenize='trigram case_sensitive 1');
CREATE TRIGGER IF NOT EXISTS ${t}_fts_ai AFTER INSERT ON ${t} BEGIN INSERT INTO ${t}_fts (rowid, ${col}) VALUES (new.rowid, new.${col}); END;
CREATE TRIGGER IF NOT EXISTS ${t}_fts_ad AFTER DELETE ON ${t} BEGIN INSERT INTO ${t}_fts (${t}_fts, rowid, ${col}) VALUES ('delete', old.rowid, old.${col}); END;
CREATE TRIGGER IF NOT EXISTS ${t}_fts_au AFTER UPDATE ON ${t} BEGIN
  INSERT INTO ${t}_fts (${t}_fts, rowid, ${col}) VALUES ('delete', old.rowid, old.${col}); INSERT INTO ${t}_fts (rowid, ${col}) VALUES (new.rowid, new.${col});
END;`;

/** Add the indexes; a file that had rows before them fills them once. */
export function upgradeFts(db: DatabaseSync): void {
  for (const [t, col] of Object.entries(FTS_COLUMNS)) {
    const had = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(`${t}_fts`);
    db.exec(ftsSql(t, col));
    if (!had) db.exec(`INSERT INTO ${t}_fts (${t}_fts) VALUES ('rebuild')`);
  }
}
