import { createHmac, timingSafeEqual } from "node:crypto";
import type { CloudApp } from "../app.js";
import { DIGEST_PERIODS, type DigestPeriod, type StopScope } from "../repo/mail-prefs.js";

export const UNSUBSCRIBE_PATH = "api/mail/unsubscribe";

// Stop links carry who and what, signed with the auth secret. They never expire: a stop link must keep working.
const keyOf = (secret: string) => createHmac("sha256", secret).update("wizelens-unsubscribe").digest();
const mac = (secret: string, payload: string) => createHmac("sha256", keyOf(secret)).update(payload).digest();

const scopeText = (s: StopScope) => (typeof s === "object" ? `digest:${s.projectId}:${s.period}` : s);

function scopeOf(text: string): StopScope | null {
  if (text === "team" || text === "health" || text === "digests") return text;
  const m = /^digest:([^:]+):([a-z]+)$/.exec(text);
  return m && DIGEST_PERIODS.includes(m[2] as DigestPeriod) ? { projectId: m[1]!, period: m[2] as DigestPeriod } : null;
}

export function signStop(secret: string, userId: string, scope: StopScope): string {
  const payload = Buffer.from(JSON.stringify([userId, scopeText(scope)])).toString("base64url");
  return `${payload}.${mac(secret, payload).toString("base64url")}`;
}

/** Who and what a stop token names, when any of the secrets signed it. */
export function readStop(secrets: readonly { value: string }[], token: string): { userId: string; scope: StopScope } | null {
  const [payload = "", sig = ""] = token.split(".");
  const given = Buffer.from(sig, "base64url");
  const ok = secrets.some((s) => {
    const want = mac(s.value, payload);
    return given.length === want.length && timingSafeEqual(given, want);
  });
  if (!ok) return null;
  try {
    const [userId, scope] = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as [unknown, unknown];
    const parsed = typeof scope === "string" ? scopeOf(scope) : null;
    return typeof userId === "string" && parsed ? { userId, scope: parsed } : null;
  } catch {
    return null;
  }
}

/** The stop link for one person and one kind of mail. */
export const stopUrl = (app: CloudApp, userId: string, scope: StopScope): string =>
  `${app.baseUrl()}/_wizelens/${UNSUBSCRIBE_PATH}?token=${signStop(app.secrets[0]!.value, userId, scope)}`;
