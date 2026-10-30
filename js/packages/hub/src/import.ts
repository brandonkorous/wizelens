import { DatabaseSync } from "node:sqlite";
import type { HubLog, HubRemote, LogRecord, Span } from "@wizeworks/lens-core/internal";
import type { HubData } from "./data.js";

const BATCH = 200;

interface TraceRow {
  trace_id: string;
  remotes: string;
}

const parseList = (json: string): string[] => {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Copy every trace from an add-on's `.wizelens/traces.db` into the hub. Returns how many traces were copied. */
export function importAddonFile(data: HubData, path: string): number {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const meta = db.prepare("SELECT value FROM meta WHERE key = 'service'").get() as { value: string } | undefined;
    const sender = { service: meta?.value ?? "imported" };
    const traces = db.prepare("SELECT trace_id, remotes FROM traces ORDER BY start_ms").all() as unknown as TraceRow[];
    const spansOf = db.prepare("SELECT json FROM spans WHERE trace_id = ?");
    const logsOf = db.prepare("SELECT json FROM logs WHERE trace_id = ? ORDER BY seq");
    for (let i = 0; i < traces.length; i += BATCH) {
      const spans: Span[] = [];
      const logs: HubLog[] = [];
      const remotes: HubRemote[] = [];
      for (const t of traces.slice(i, i + BATCH)) {
        for (const r of spansOf.all(t.trace_id) as { json: string }[]) spans.push(JSON.parse(r.json) as Span);
        for (const r of logsOf.all(t.trace_id) as { json: string }[]) logs.push({ traceId: t.trace_id, log: JSON.parse(r.json) as LogRecord });
        for (const endpoint of parseList(t.remotes)) remotes.push({ traceId: t.trace_id, endpoint });
      }
      data.write({ sender, via: "addon", spans, logs, remotes });
    }
    return traces.length;
  } finally {
    db.close();
  }
}
