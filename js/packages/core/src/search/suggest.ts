// Autocomplete: field names, attribute keys, and the common values of a field, newest data first.
import type { TimeWindow } from "../stats/common.js";
import { LOG_LEVELS } from "../stats/logs.js";
import type { Trace } from "../types.js";
import { isSearchField, SEARCH_FIELDS, type SearchField } from "./ast.js";
import { docEntries } from "./items.js";

export interface Suggestion {
  /** What to insert: "service", "@user.id", or a value. */
  value: string;
  help?: string;
  count?: number;
}

/** `field` null asks for field names and attribute keys; else for values of that field ("service", "@user.id"). */
export interface SuggestRequest {
  field: string | null;
  prefix: string;
  window: TimeWindow;
  limit: number;
  /** The environment memory documents carry (in-app: the service's own); SQL hosts read it from their rows. */
  env?: string;
}

/** Values every host knows without reading data. */
export const FIXED_VALUES: Partial<Record<SearchField, readonly string[]>> = {
  status: ["ok", "error", "unset", "2xx", "3xx", "4xx", "5xx"],
  level: LOG_LEVELS,
  error: ["true", "false"],
  kind: ["server", "client", "internal", "producer", "consumer"],
};

/** Fields whose values come from data, and the kind whose rows hold them. */
export const DATA_FIELDS: Partial<Record<SearchField, "spans" | "traces" | "logs">> = {
  service: "spans", env: "traces", name: "spans", method: "spans", path: "spans", route: "spans", category: "spans", user: "spans",
};

const starts = (s: string, prefix: string) => s.toLowerCase().startsWith(prefix.toLowerCase());

/** Known fields that start with the prefix. */
export const fieldSuggestions = (prefix: string): Suggestion[] =>
  Object.entries(SEARCH_FIELDS).filter(([name]) => starts(name, prefix)).map(([name, spec]) => ({ value: name, help: spec.help }));

export const fixedSuggestions = (field: string, prefix: string): Suggestion[] =>
  isSearchField(field) ? (FIXED_VALUES[field] ?? []).filter((v) => starts(v, prefix)).map((value) => ({ value })) : [];

/** Counted values, most common first, then by value in code-unit order. */
export function topCounts(counts: Map<string, number>, limit: number): Suggestion[] {
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit).map(([value, count]) => ({ value, count }));
}

function countMemory(traces: readonly Trace[], r: SuggestRequest): Map<string, number> {
  const counts = new Map<string, number>();
  const prefix = r.field === null ? r.prefix.replace(/^@/, "") : r.prefix;
  const add = (v: unknown, label = String(v)) => {
    if (v === null || v === undefined || v === "") return;
    if (starts(String(v), prefix)) counts.set(label, (counts.get(label) ?? 0) + 1);
  };
  const field = r.field;
  const kind = field === null || field.startsWith("@") ? "spans" : isSearchField(field) ? DATA_FIELDS[field] : undefined;
  if (!kind) return counts;
  for (const t of traces) {
    for (const e of docEntries(t, kind, r.env)) {
      if (e.timeMs < r.window.from || e.timeMs >= r.window.to) continue;
      if (field === null) Object.entries(e.doc.attrs[0] ?? {}).forEach(([k, v]) => v !== null && v !== "" && add(k, `@${k}`));
      else if (field.startsWith("@")) add(e.doc.attrs[0]?.[field.slice(1)]);
      else add(e.doc.fields[field as SearchField]);
    }
  }
  return counts;
}

/** Suggestions from traces held in memory. */
export function suggestMemory(traces: readonly Trace[], r: SuggestRequest): Suggestion[] {
  const fixed = r.field === null ? (r.prefix.startsWith("@") ? [] : fieldSuggestions(r.prefix)) : fixedSuggestions(r.field, r.prefix);
  return [...fixed, ...topCounts(countMemory(traces, r), r.limit)].slice(0, r.limit);
}
