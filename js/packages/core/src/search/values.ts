// Field values: wildcards, numbers, durations, statuses, and levels, checked against the field's type.
import { LOG_LEVELS } from "../stats/logs.js";
import type { LogLevel } from "../types.js";
import type { Cmp, FieldType, Piece, SearchValue } from "./ast.js";
import type { Ch } from "./lex.js";

const DURATION = /^((?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(us|µs|ms|s|m|h)?$/i;
const UNIT_MS: Record<string, number> = { us: 0.001, "µs": 0.001, ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
const NUMBER = /^-?(\d+(?:\.\d+)?|\.\d+)(e[+-]?\d+)?$/i;
const LEVEL_ALIASES: Record<string, LogLevel> = { warning: "warn", err: "error", fatal: "critical", crit: "critical" };
const SPAN_STATUSES = new Set(["ok", "error", "unset"]);

/** A value that failed its field's type; the parser adds the position. */
export class ValueError extends Error {}

const text = (chars: readonly Ch[]): string => chars.map((ch) => ch.c).join("");

/** Wildcard pieces when the value has an unquoted `*`; else null. */
export function piecesOf(chars: readonly Ch[]): Piece[] | null {
  if (!chars.some((ch) => ch.c === "*" && !ch.lit)) return null;
  const out: Piece[] = [];
  let cur = "";
  for (const ch of chars) {
    if (ch.c === "*" && !ch.lit) {
      if (cur) out.push(cur);
      if (out[out.length - 1] !== null) out.push(null);
      cur = "";
    } else cur += ch.c;
  }
  if (cur) out.push(cur);
  return out;
}

/** Milliseconds from "250ms", "1.5s", "2m", or a bare number (ms). Exponents are allowed, as numbers print them. */
export function durationMs(s: string): number {
  const m = DURATION.exec(s.trim());
  if (!m) throw new ValueError(`"${s}" is not a duration. Use 250ms, 1.5s, or 2m.`);
  return Number(m[1]) * UNIT_MS[(m[2] ?? "ms").toLowerCase()]!;
}

export function levelOf(s: string): LogLevel {
  const v = s.toLowerCase();
  const level = LEVEL_ALIASES[v] ?? (LOG_LEVELS as readonly string[]).find((l) => l === v);
  if (!level) throw new ValueError(`"${s}" is not a log level. Use ${LOG_LEVELS.join(", ")}.`);
  return level as LogLevel;
}

function statusValue(s: string, cmp: Cmp): SearchValue {
  const v = s.toLowerCase();
  if (cmp === "=" && SPAN_STATUSES.has(v)) return { type: "spanStatus", value: v as "ok" | "error" | "unset" };
  if (cmp === "=" && /^[1-5]xx$/.test(v)) return { type: "statusClass", value: Number(v[0]) };
  if (/^\d{3}$/.test(v)) return { type: "number", value: Number(v) };
  throw new ValueError(`"${s}" is not a status. Use 404, 5xx, ok, error, or unset.`);
}

function boolValue(s: string): SearchValue {
  const v = s.toLowerCase();
  if (v === "true" || v === "false") return { type: "bool", value: v === "true" };
  throw new ValueError(`"${s}" is not true or false.`);
}

/** A text or id value: exact, or a pattern. Text fields cannot be compared with < or >. */
function textValue(chars: readonly Ch[], cmp: Cmp, type: FieldType): SearchValue {
  if (cmp !== "=") throw new ValueError(`This field holds ${type === "id" ? "ids" : "text"}. It cannot use ${cmp}.`);
  const pieces = piecesOf(chars);
  return pieces ? { type: "pattern", pieces } : { type: "string", value: text(chars) };
}

/** The value of `field:value` for a known field of `type`. */
export function fieldValue(type: FieldType, chars: readonly Ch[], cmp: Cmp): SearchValue {
  const s = text(chars);
  if (type === "text" || type === "id") return textValue(chars, cmp, type);
  if (type === "duration") return { type: "number", value: durationMs(s) };
  if (type === "status") return statusValue(s, cmp);
  if (type === "level") return { type: "level", value: levelOf(s) };
  if (cmp !== "=") throw new ValueError("true or false cannot use < or >.");
  return boolValue(s);
}

/** The value of `@key:value`: text or a pattern for =, a number for comparisons. */
export function attrValue(chars: readonly Ch[], cmp: Cmp): SearchValue {
  const s = text(chars);
  if (cmp === "=") return textValue(chars, cmp, "text");
  if (!NUMBER.test(s)) throw new ValueError(`${cmp} needs a number, not "${s}".`);
  return { type: "number", value: Number(s) };
}

/** Field types that take ranges (a..b) and comparisons. */
export const ORDERED: ReadonlySet<FieldType> = new Set(["status", "duration", "level"]);
