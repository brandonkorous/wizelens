import type { AttributeValue, Attributes } from "./types.js";

export const REDACTED = "[redacted]";

export const DEFAULT_REDACT_KEYS: readonly string[] = [
  "authorization",
  "cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "connectionstring",
];

/** True when the key (case-insensitive) contains any sensitive fragment. */
export function isSensitiveKey(key: string, keys: readonly string[] = DEFAULT_REDACT_KEYS): boolean {
  const k = key.toLowerCase();
  return keys.some((s) => k.includes(s));
}

export function redactAttributes(attrs: Attributes, keys: readonly string[] = DEFAULT_REDACT_KEYS): Attributes {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(attrs)) out[k] = v !== null && isSensitiveKey(k, keys) ? REDACTED : v;
  return out;
}

/** Turn any value into a contract attribute value. Arrays and objects become JSON strings. */
export function toAttributeValue(value: unknown): AttributeValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const bigintSafe = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

/**
 * Serialize DB parameters to the `wizelens.db.parameters` JSON string.
 * Named parameters whose name looks sensitive are redacted. Positional parameters have no names, so they are kept.
 */
export function redactParams(params: unknown, keys: readonly string[] = DEFAULT_REDACT_KEYS): string | null {
  if (params === undefined || params === null) return null;
  if (Array.isArray(params)) return JSON.stringify(params, bigintSafe);
  if (typeof params === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) out[k] = isSensitiveKey(k, keys) ? REDACTED : v;
    return JSON.stringify(out, bigintSafe);
  }
  return JSON.stringify([params], bigintSafe);
}
