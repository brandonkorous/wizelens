// The search language: its syntax tree and its known fields. See docs/SEARCH-PLAN.md, "The search language".
import type { LogLevel, SpanStatus } from "../types.js";

/** What a search finds. */
export type SearchKind = "requests" | "traces" | "spans" | "logs";
export const SEARCH_KINDS: readonly SearchKind[] = ["requests", "traces", "spans", "logs"];

/** How a known field reads its value. */
export type FieldType = "text" | "id" | "status" | "duration" | "level" | "bool";

export interface FieldSpec {
  type: FieldType;
  /** One line for autocomplete and errors. */
  help: string;
  /** The kinds that have the field; others never match it. */
  kinds: readonly SearchKind[];
}

const ALL = SEARCH_KINDS;
const NOT_LOGS: readonly SearchKind[] = ["requests", "traces", "spans"];

/** Short names that map to columns. Anything else is an attribute: `@key:value`. */
export const SEARCH_FIELDS = {
  service: { type: "text", help: "Service name", kinds: ALL },
  env: { type: "text", help: "Environment", kinds: ALL },
  trace: { type: "id", help: "Trace id, or its start", kinds: ALL },
  span: { type: "id", help: "Span id, or its start", kinds: ["spans", "logs"] },
  name: { type: "text", help: "Span name, or the trace's root span name", kinds: ["traces", "spans", "logs"] },
  method: { type: "text", help: "HTTP method", kinds: NOT_LOGS },
  path: { type: "text", help: "URL path", kinds: NOT_LOGS },
  route: { type: "text", help: "Route template, such as /orders/{id}", kinds: ["requests", "spans"] },
  status: { type: "status", help: "HTTP status (500, 5xx) or span status (ok, error, unset)", kinds: NOT_LOGS },
  duration: { type: "duration", help: "Duration: 250ms, 1.5s, 2m", kinds: NOT_LOGS },
  level: { type: "level", help: "Log level: trace, debug, info, warn, error, critical", kinds: ["logs"] },
  category: { type: "text", help: "Log category, or span category (db, http.client, ...)", kinds: ["spans", "logs"] },
  kind: { type: "text", help: "Span kind: server, client, internal, producer, consumer", kinds: ["spans"] },
  user: { type: "text", help: "End user id", kinds: ["requests", "spans"] },
  error: { type: "bool", help: "true when it failed", kinds: ALL },
  message: { type: "text", help: "Log message", kinds: ["logs"] },
  tag: { type: "text", help: "Tag: a tag rule's name, or a tag the app sets", kinds: ALL },
} as const satisfies Record<string, FieldSpec>;

export type SearchField = keyof typeof SEARCH_FIELDS;

export const isSearchField = (name: string): name is SearchField => Object.hasOwn(SEARCH_FIELDS, name);

/** Comparisons. Ranges become two of them; negation is a `not` node. */
export type Cmp = "=" | ">" | ">=" | "<" | "<=";

/** A pattern piece: literal text, or null for "any text". */
export type Piece = string | null;

export type SearchValue =
  | { type: "string"; value: string }
  | { type: "pattern"; pieces: Piece[] }
  | { type: "number"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "level"; value: LogLevel }
  | { type: "statusClass"; value: number }
  | { type: "spanStatus"; value: SpanStatus }
  | { type: "exists" };

export type SearchNode =
  | { type: "and"; items: SearchNode[] }
  | { type: "or"; items: SearchNode[] }
  | { type: "not"; item: SearchNode }
  | { type: "text"; value: string }
  | { type: "field"; field: SearchField; cmp: Cmp; value: SearchValue }
  | { type: "attr"; key: string; cmp: Cmp; value: SearchValue };

/** A parse error, with the character span it covers. */
export class SearchError extends Error {
  constructor(
    message: string,
    readonly start: number,
    readonly end: number,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

/** Limits that keep one query cheap to run. */
export const SEARCH_LIMITS = { chars: 2000, terms: 64, depth: 16 } as const;
