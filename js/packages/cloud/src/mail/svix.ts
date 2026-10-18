import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_S = 5 * 60;

export interface SvixHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

/** True when a webhook body was signed with this `whsec_` secret (Svix, used by Resend) within the last 5 minutes. */
export function verifySvix(secret: string, h: SvixHeaders, rawBody: string, nowMs: number): boolean {
  if (!h.id || !h.timestamp || !h.signature || !/^\d+$/.test(h.timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(h.timestamp)) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest();
  return h.signature.split(" ").some((entry) => {
    const [version, sig = ""] = entry.split(",");
    const given = Buffer.from(sig, "base64");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}
