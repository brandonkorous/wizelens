// Log patterns: a message with its changing parts (numbers, ids, uuids, quoted values) masked, so similar lines group together.
import { hash53 } from "../loose.js";

/** Patterns are cut to this many characters. */
export const PATTERN_MAX = 200;

const MASKS: [RegExp, string][] = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
  [/"[^"\n]{0,200}"|'[^'\n]{0,200}'|`[^`\n]{0,200}`/g, "<str>"],
  [/\b0x[0-9a-f]+\b/gi, "<id>"],
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi, "<id>"],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{16,}\b/g, "<id>"],
  [/\d+(?:\.\d+)*/g, "<num>"],
];

/** The pattern of a message: its first line, changing parts masked, spaces collapsed, cut to `PATTERN_MAX`. */
export function logPattern(message: string): string {
  let out = (message.split("\n", 1)[0] ?? "").trim();
  for (const [re, mask] of MASKS) out = out.replace(re, mask);
  out = out.replace(/\s+/g, " ");
  return out.length > PATTERN_MAX ? out.slice(0, PATTERN_MAX) : out;
}

const ids = new Map<string, string>();

/** A short id for a message's pattern (14 hex digits), what the Logs page filters on. */
export function patternIdOf(message: string): string {
  const hit = ids.get(message);
  if (hit !== undefined) return hit;
  const id = hash53(logPattern(message));
  if (ids.size > 50_000) ids.clear();
  ids.set(message, id);
  return id;
}
