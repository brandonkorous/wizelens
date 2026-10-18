import { randomBytes } from "node:crypto";
import type { Db } from "../db/db.js";

export interface AuthSecret {
  version: number;
  value: string;
}

const MIN_LENGTH = 32;

/** "value", or "2:new,1:old" to rotate (newest first). Rotating signs everyone out; encrypted 2FA data still opens with the old one. */
export function parseSecrets(text: string): AuthSecret[] {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  const secrets = parts.map((p, i) => {
    const m = /^(\d+):(.+)$/.exec(p);
    return m ? { version: Number(m[1]), value: m[2]! } : { version: parts.length - i, value: p };
  });
  if (secrets.length === 0 || secrets.some((s) => s.value.length < MIN_LENGTH)) throw new Error(`Each auth secret needs at least ${MIN_LENGTH} characters (try: openssl rand -base64 32).`);
  return secrets;
}

/** The configured secrets. A trial on PGlite without one gets a random secret kept in its own database; Postgres must be given one. */
export async function resolveSecrets(db: Db, configured: string | undefined): Promise<AuthSecret[]> {
  if (configured) return parseSecrets(configured);
  if (db.kind === "postgres") throw new Error("Set --auth-secret (or WIZELENS_CLOUD_AUTH_SECRET) to 32 or more random characters: it signs sessions and encrypts 2FA secrets.");
  const [row] = await db.query<{ value: string }>("SELECT value FROM cloud_meta WHERE key = 'auth_secret'");
  if (row) return parseSecrets(row.value);
  const value = randomBytes(36).toString("base64url");
  await db.query("INSERT INTO cloud_meta (key, value) VALUES ('auth_secret', $1) ON CONFLICT (key) DO NOTHING", [value]);
  return resolveSecrets(db, undefined);
}

/** Better Auth reads these over its options; clear them so only our config counts. */
export function clearAuthEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const k of ["BETTER_AUTH_TELEMETRY", "BETTER_AUTH_TELEMETRY_ENDPOINT", "BETTER_AUTH_TELEMETRY_DEBUG", "BETTER_AUTH_SECRET", "BETTER_AUTH_SECRETS", "AUTH_SECRET", "BETTER_AUTH_URL"]) delete env[k];
}
