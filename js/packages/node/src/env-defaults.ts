// The env vars every SDK reads the same way: WIZELENS_KEEP_SLOW_MS and WIZELENS_REDACT_KEYS.
type Env = Readonly<Record<string, string | undefined>>;

const OFF = new Set(["off", "none", "null", "false"]);
const warned = new Set<string>();

/** WIZELENS_KEEP_SLOW_MS: undefined when blank or not a number, null when off, else the ms. */
export function envKeepSlowMs(env: Env): number | null | undefined {
  const raw = env.WIZELENS_KEEP_SLOW_MS?.trim();
  if (!raw) return undefined;
  if (OFF.has(raw.toLowerCase())) return null;
  const ms = Number(raw);
  if (Number.isFinite(ms)) return ms;
  if (!warned.has(raw)) {
    warned.add(raw);
    console.warn(`[wizelens] WIZELENS_KEEP_SLOW_MS=${raw} is not a number of milliseconds or off, so the default is used.`);
  }
  return undefined;
}

/** The comma-separated WIZELENS_REDACT_KEYS names, added to the redact keys. */
export function envRedactKeys(env: Env): string[] {
  return (env.WIZELENS_REDACT_KEYS ?? "").split(",").map((k) => k.trim().toLowerCase()).filter((k) => k !== "");
}
