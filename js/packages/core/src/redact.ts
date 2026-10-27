import { redactText, skipsValuePatterns } from "./redact-values.js";
import { paramColumns, SQL_PARAM_KEYS } from "./redact-sql-params.js";
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

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** A query string with the values of sensitive keys replaced: `token=[redacted]`. Keys and other values stay. */
export function redactQueryString(query: string, keys: readonly string[] = DEFAULT_REDACT_KEYS): string {
  return query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq >= 0 && isSensitiveKey(decode(pair.slice(0, eq)), keys) ? `${pair.slice(0, eq + 1)}${REDACTED}` : pair;
    })
    .join("&");
}

/** A URL with its query redacted as `redactQueryString` does. */
export function redactUrl(url: string, keys: readonly string[] = DEFAULT_REDACT_KEYS): string {
  const q = url.indexOf("?");
  return q < 0 ? url : url.slice(0, q + 1) + redactQueryString(url.slice(q + 1), keys);
}

/** Cookies in one `set-cookie` value: split at ", " before the next `name=`, so an Expires date stays whole. */
export const splitSetCookie = (value: string): string[] => value.split(/,\s*(?=[^;,\s=]+=)/);

/** A `set-cookie` value with each cookie's value hidden and its name and flags kept: `sid=[redacted]; Path=/; HttpOnly`. */
export function redactSetCookie(value: string): string {
  return splitSetCookie(value)
    .map((cookie) => {
      const semi = cookie.indexOf(";");
      const head = semi < 0 ? cookie : cookie.slice(0, semi);
      const eq = head.indexOf("=");
      return `${(eq < 0 ? head : head.slice(0, eq)).trim()}=${REDACTED}${semi < 0 ? "" : cookie.slice(semi)}`;
    })
    .join(", ");
}

/** One attribute value as stored: by its key first, then secrets found inside the text. */
export function redactValue(key: string, value: AttributeValue, keys: readonly string[] = DEFAULT_REDACT_KEYS): AttributeValue {
  if (value === null) return null;
  const k = key.toLowerCase();
  if (typeof value !== "string") return isSensitiveKey(k, keys) ? REDACTED : value;
  if (k === "set-cookie" || k.endsWith(".set-cookie")) return value === REDACTED ? value : redactSetCookie(value);
  if (isSensitiveKey(k, keys)) return REDACTED;
  if (k === "url.query") return redactText(redactQueryString(value, keys));
  if (k === "url.full") return redactText(redactUrl(value, keys));
  return skipsValuePatterns(k) ? value : redactText(value, k);
}

export function redactAttributes(attrs: Attributes, keys: readonly string[] = DEFAULT_REDACT_KEYS): Attributes {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(attrs)) out[k] = redactValue(k, v, keys);
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

/** One positional value: redacted when its column is sensitive, else with secrets found by pattern replaced. */
function positional(value: unknown, column: string | undefined, keys: readonly string[]): unknown {
  if (column && isSensitiveKey(column, [...keys, ...SQL_PARAM_KEYS])) return REDACTED;
  return typeof value === "string" ? redactText(value) : value;
}

/** DB parameters as the `wizelens.db.parameters` JSON string; sensitive names redacted, positional ones by the column `sql` binds them to. */
export function redactParams(params: unknown, keys: readonly string[] = DEFAULT_REDACT_KEYS, sql = ""): string | null {
  if (params === undefined || params === null) return null;
  if (Array.isArray(params)) {
    const columns = paramColumns(sql);
    return JSON.stringify(params.map((v, i) => positional(v, columns.get(i), keys)), bigintSafe);
  }
  if (typeof params === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) out[k] = positional(v, k, keys);
    return JSON.stringify(out, bigintSafe);
  }
  return JSON.stringify([params], bigintSafe);
}
