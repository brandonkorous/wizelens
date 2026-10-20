// Settings a host keeps per project: thresholds, extra redacted keys, and a shorter retention. Hosts check and apply them the same way.
import type { MetricPoint } from "./metrics/types.js";
import { isSensitiveKey, REDACTED, redactAttributes } from "./redact.js";
import type { FactOptions } from "./scale/facts.js";
import type { HubLog } from "./hub.js";
import type { Span } from "./types.js";

export interface ProjectSettings {
  /** A database call this slow or slower counts as slow. */
  slowQueryMs?: number;
  /** This many similar calls in one request is an N+1. */
  nPlusOneThreshold?: number;
  /** Keys hidden on top of the host's list (a key matches when its name contains one). */
  redactKeys?: string[];
  /** Keep this project's data for fewer days than the host or organization does. */
  retentionDays?: number;
}

/** The host's values, which a project setting overrides. */
export interface SettingsDefaults {
  slowQueryMs: number;
  nPlusOneThreshold: number;
  redactKeys: readonly string[];
  retentionDays: number;
}

export const SETTING_LIMITS = { slowQueryMs: [1, 60_000], nPlusOneThreshold: [2, 1_000], retentionDays: [1, 400], redactKeys: 50, keyLength: 64 } as const;

const DB_PARAMS = "wizelens.db.parameters";

function intIn(raw: unknown, [lo, hi]: readonly [number, number], label: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${label} must be a whole number from ${lo} to ${hi}.`);
  return n;
}

function keysOf(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new Error("Redacted keys must be a list.");
  const keys = [...new Set(raw.map((k) => String(k).trim().toLowerCase()).filter(Boolean))];
  if (keys.length > SETTING_LIMITS.redactKeys) throw new Error(`Add at most ${SETTING_LIMITS.redactKeys} redacted keys.`);
  if (keys.some((k) => k.length > SETTING_LIMITS.keyLength)) throw new Error(`A redacted key is at most ${SETTING_LIMITS.keyLength} characters.`);
  return keys.length ? keys : undefined;
}

/** Checked settings from a request body; empty values fall back to the host. Throws a message for people on a bad value. */
export function parseSettings(raw: unknown, maxRetentionDays: number): ProjectSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: ProjectSettings = {
    slowQueryMs: intIn(r.slowQueryMs, SETTING_LIMITS.slowQueryMs, "Slow query"),
    nPlusOneThreshold: intIn(r.nPlusOneThreshold, SETTING_LIMITS.nPlusOneThreshold, "N+1 threshold"),
    redactKeys: keysOf(r.redactKeys),
    retentionDays: intIn(r.retentionDays, [1, Math.min(maxRetentionDays, SETTING_LIMITS.retentionDays[1])], "Retention"),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as ProjectSettings;
}

/** Stored settings, never throwing: bad or missing values are left out. */
export function settingsOf(json: string | null | undefined): ProjectSettings {
  try {
    return json ? parseSettings(JSON.parse(json), SETTING_LIMITS.retentionDays[1]) : {};
  } catch {
    return {};
  }
}

/** The fact options a project's traces settle with. */
export const factOptionsOf = (s: ProjectSettings | null | undefined): Partial<FactOptions> => ({
  ...(s?.slowQueryMs ? { slowQueryMs: s.slowQueryMs } : {}),
  ...(s?.nPlusOneThreshold ? { nPlusOneThreshold: s.nPlusOneThreshold } : {}),
});

/** The values in effect for a project. */
export const effectiveSettings = (d: SettingsDefaults, s: ProjectSettings): SettingsDefaults => ({
  slowQueryMs: s.slowQueryMs ?? d.slowQueryMs,
  nPlusOneThreshold: s.nPlusOneThreshold ?? d.nPlusOneThreshold,
  redactKeys: [...new Set([...d.redactKeys, ...(s.redactKeys ?? [])])],
  retentionDays: Math.min(s.retentionDays ?? d.retentionDays, d.retentionDays),
});

/** DB parameters (a JSON object string) with sensitive names hidden. */
function redactParamsText(v: string, keys: readonly string[]): string {
  try {
    const parsed = JSON.parse(v) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return v;
    return JSON.stringify(Object.fromEntries(Object.entries(parsed).map(([k, x]) => [k, isSensitiveKey(k, keys) ? REDACTED : x])));
  } catch {
    return v;
  }
}

function redactAll<T extends { attributes: Span["attributes"] }>(x: T, keys: readonly string[]): T {
  const attributes = redactAttributes(x.attributes, keys);
  const params = attributes[DB_PARAMS];
  if (typeof params === "string") attributes[DB_PARAMS] = redactParamsText(params, keys);
  return { ...x, attributes };
}

/** Spans, logs, and metric points with a project's extra keys hidden too. Unchanged when there are none. */
export function redactSignals<W extends { spans: readonly Span[]; logs: readonly HubLog[]; metrics?: readonly MetricPoint[] }>(w: W, keys: readonly string[] | undefined): W {
  if (!keys?.length) return w;
  return {
    ...w,
    spans: w.spans.map((s) => ({ ...redactAll(s, keys), events: s.events.map((e) => redactAll(e, keys)) })),
    logs: w.logs.map((l) => ({ ...l, log: redactAll(l.log, keys) })),
    ...(w.metrics ? { metrics: w.metrics.map((m) => redactAll(m, keys)) } : {}),
  };
}
