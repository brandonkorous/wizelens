import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createWizeLens } from "../wizelens.js";
import { instrumentNodeSqlite } from "./sqlite.js";

describe("WizeLens storage", () => {
  it("is never traced, even when node:sqlite is instrumented", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "wizelens-self-")), "traces.db");
    const wizelens = createWizeLens({ service: "self", storagePath, traceQueriesOutsideRequests: true });
    const db = new DatabaseSync(":memory:");
    instrumentNodeSqlite(wizelens, db);
    db.prepare("SELECT 1").get();
    await wizelens.shutdown();
    const names = wizelens.store.all().map((t) => t.rootName);
    expect(names).toEqual(["SELECT"]);
  });
});
