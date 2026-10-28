// Check a check from a request body. Hubs and the cloud use the same rules, so a check moves between them unchanged.
import { isSensitiveKey, REDACTED } from "../redact.js";
import { DEFAULT_EXPECT_STATUS, UPTIME_LIMITS as L, UPTIME_METHODS, type UptimeCheckInput, type UptimeMethod } from "./check.js";

export type InputResult = { ok: true; input: UptimeCheckInput } | { ok: false; error: string };

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/;
const STATUS_PART = /^([1-5]\d\d)(?:-([1-5]\d\d))?$/;

/** Status ranges from "200", "200-299", or "200,204,301-302". Null when it does not parse. */
export function parseExpectStatus(text: string): [number, number][] | null {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 10) return null;
  const out: [number, number][] = [];
  for (const p of parts) {
    const m = STATUS_PART.exec(p);
    if (!m) return null;
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    if (hi < lo) return null;
    out.push([lo, hi]);
  }
  return out;
}

/** True when a status code is one the check expects. */
export function statusMatches(expect: string, status: number): boolean {
  return (parseExpectStatus(expect) ?? parseExpectStatus(DEFAULT_EXPECT_STATUS)!).some(([lo, hi]) => status >= lo && status <= hi);
}

/** Headers as plain name and value text. A value sent back as "[redacted]" keeps the value it had. */
function headersOf(raw: unknown, current: Record<string, string>): Record<string, string> | string {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return "Send headers as an object of names and values.";
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > L.maxHeaders) return `Send at most ${L.maxHeaders} headers.`;
  const out: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (!HEADER_NAME.test(name)) return `"${name}" is not a valid header name.`;
    if (typeof value !== "string" || value.length > 4000 || /[\r\n]/.test(value)) return `The value of ${name} must be one line of text.`;
    out[name] = value === REDACTED && current[name] !== undefined ? current[name]! : value;
  }
  return out;
}

function urlProblem(url: string): string | null {
  if (!url || url.length > L.maxUrl) return `Set a URL of at most ${L.maxUrl} characters.`;
  if (!URL.canParse(url)) return "Not a valid URL.";
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Use an http:// or https:// URL.";
  return u.username || u.password ? "Put credentials in a header, not in the URL." : null;
}

const numberIn = (v: unknown, fallback: number, min: number, max: number): number | null => {
  const n = v === undefined ? fallback : Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Check a body. A change sends only what it changes; the rest comes from `current`. */
export function parseCheckInput(raw: unknown, current?: UptimeCheckInput): InputResult {
  const b = { ...current, ...(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) } as Record<string, unknown>;
  const fail = (error: string): InputResult => ({ ok: false, error });
  const url = typeof b.url === "string" ? b.url.trim() : "";
  const bad = urlProblem(url);
  if (bad) return fail(bad);
  const method = String(b.method ?? "GET").toUpperCase() as UptimeMethod;
  if (!UPTIME_METHODS.includes(method)) return fail(`Pick a method: ${UPTIME_METHODS.join(", ")}.`);
  const expectStatus = typeof b.expectStatus === "string" && b.expectStatus.trim() ? b.expectStatus.replace(/\s+/g, "") : DEFAULT_EXPECT_STATUS;
  if (!parseExpectStatus(expectStatus)) return fail('Set expected status as "200", "200-299", or a list like "200,301-302".');
  const intervalMin = numberIn(b.intervalMin, 5, L.minIntervalMin, L.maxIntervalMin);
  if (intervalMin === null) return fail(`Run every ${L.minIntervalMin} to ${L.maxIntervalMin} minutes (whole minutes).`);
  const timeoutMs = numberIn(b.timeoutMs, 10_000, L.minTimeoutMs, L.maxTimeoutMs);
  if (timeoutMs === null) return fail(`Set a timeout of ${L.minTimeoutMs / 1000} to ${L.maxTimeoutMs / 1000} seconds.`);
  const headers = headersOf(b.headers, current?.headers ?? {});
  if (typeof headers === "string") return fail(headers);
  const expectBody = typeof b.expectBody === "string" ? b.expectBody : "";
  if (expectBody.length > L.maxExpectBody) return fail(`Expected body text is at most ${L.maxExpectBody} characters.`);
  if (expectBody && method === "HEAD") return fail("HEAD answers have no body: clear the expected text, or pick GET.");
  const name = (typeof b.name === "string" ? b.name.trim() : "").slice(0, L.maxName) || new URL(url).host;
  const env = typeof b.env === "string" ? b.env.trim().slice(0, 50) : "";
  return { ok: true, input: { name, url, method, headers, expectStatus, expectBody, intervalMin, timeoutMs, env, enabled: b.enabled !== false } };
}

/** Headers as an API shows them: secret-looking values replaced by "[redacted]". */
export const shownHeaders = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, isSensitiveKey(k) || /^(x-)?api-?key$/i.test(k) ? REDACTED : v]));

/** Why a new or changed check repeats one the project has (same name, method, and URL), or null. `id` is the check being changed. */
export function sameCheckProblem(checks: readonly (UptimeCheckInput & { id: string })[], input: UptimeCheckInput, id?: string): string | null {
  const key = (c: UptimeCheckInput) => `${c.name.trim().toLowerCase()} ${c.method} ${c.url}`;
  const twin = checks.find((c) => c.id !== id && key(c) === key(input));
  return twin ? `"${twin.name}" already checks ${twin.method} ${twin.url}. Edit that check, or give this one another name.` : null;
}
