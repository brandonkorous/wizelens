import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqlitePersister, TraceStore } from "@wizeworks/lens-node/internal";
import { afterEach, expect, it } from "vitest";
import { HubData } from "./data.js";
import { importAddonFile } from "./import.js";
import { HubStore } from "./store.js";
import { span, T1 } from "./test/helpers.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

it("copies an add-on's trace file into the hub", () => {
  const dir = mkdtempSync(join(tmpdir(), "wl-import-"));
  dirs.push(dir);
  const path = join(dir, "traces.db");
  const store = new TraceStore({ now: () => 1_000_100 });
  const persister = new SqlitePersister(store, { path, service: "orders-api", now: () => 1_000_100 });
  expect(persister.open()).toBe(true);
  store.addSpan(span(T1, "1".repeat(16)));
  store.addRemote(T1, "http://other/_wizelens");
  persister.close();

  const data = new HubData(new HubStore({ path: ":memory:", now: () => 1_000_100 }));
  expect(importAddonFile(data, path)).toBe(1);
  const [t] = data.traces({ limit: 5 });
  expect(t).toMatchObject({ traceId: T1, spanCount: 1, remotes: ["http://other/_wizelens"] });
});
