// A list of uptime checks to add at once: one URL per row, with an optional name, method, interval, and expected status.
import { parseCheckInput } from "../uptime/input.js";
import type { UptimeCheckInput } from "../uptime/check.js";
import type { ImportProblem } from "./projects.js";
import { readRows } from "./rows.js";

export interface CheckImportRow {
  row: number;
  input: UptimeCheckInput;
}

const SHAPE = {
  headers: { url: "url", address: "url", name: "name", method: "method", interval: "intervalMin", "interval (minutes)": "intervalMin", intervalmin: "intervalMin", minutes: "intervalMin", "expected status": "expectStatus", status: "expectStatus", expectstatus: "expectStatus", environment: "env", env: "env" },
  order: ["url", "name", "method", "intervalMin", "expectStatus"],
};

/** Checks from a file, each checked like one made by hand. Nothing is added while a row is wrong. */
export function parseCheckImport(text: string, max: number): { rows: CheckImportRow[]; problems: ImportProblem[] } {
  const raw = readRows(text, SHAPE);
  if (typeof raw === "string") return { rows: [], problems: [{ row: 0, message: raw }] };
  const rows: CheckImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Map<string, number>();
  if (raw.length > max) problems.push({ row: 0, message: `A project runs at most ${max} checks; this list has ${raw.length}.` });
  for (const r of raw.slice(0, max)) {
    // An empty cell means "the default", as in the form.
    const given = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== ""));
    const parsed = parseCheckInput({ ...given, ...(given.intervalMin !== undefined ? { intervalMin: Number(given.intervalMin) } : {}) });
    if (!parsed.ok) {
      problems.push({ row: r.row, message: parsed.error });
      continue;
    }
    const key = `${parsed.input.method} ${parsed.input.url}`;
    const first = seen.get(key);
    if (first !== undefined) problems.push({ row: r.row, message: `${key} is already on row ${first}.` });
    else {
      seen.set(key, r.row);
      rows.push({ row: r.row, input: parsed.input });
    }
  }
  return { rows, problems };
}
