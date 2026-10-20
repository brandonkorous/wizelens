// A04 Cryptographic Failures: cookies set without Secure, or session cookies without HttpOnly.
import type { Finding } from "../analysis.js";
import { REDACTED, splitSetCookie } from "../redact.js";
import { spanFinding } from "./headers.js";
import type { SecurityRequest } from "./request.js";

const SESSION_NAME = /sess|sid|auth|token|jwt|login|remember|identity|\.aspnetcore\./i;

interface Cookie {
  name: string;
  /** Flag names, lower case, with their values: `samesite` -> `none`. */
  flags: Map<string, string>;
}

/** The cookies of a `set-cookie` value; null when it was redacted whole. */
export function parseSetCookie(value: string): Cookie[] | null {
  if (value === REDACTED) return null;
  return splitSetCookie(value).map((c) => {
    const [head = "", ...parts] = c.split(";");
    const eq = head.indexOf("=");
    const flags = new Map<string, string>();
    for (const p of parts) {
      const i = p.indexOf("=");
      flags.set((i < 0 ? p : p.slice(0, i)).trim().toLowerCase(), i < 0 ? "" : p.slice(i + 1).trim().toLowerCase());
    }
    return { name: (eq < 0 ? head : head.slice(0, eq)).trim(), flags };
  });
}

/** The flags a cookie lacks, in the order `HttpOnly, Secure`. */
export function missingFlags(c: Cookie, https: boolean): string[] {
  if (c.flags.get("max-age") === "0") return [];
  const missing: string[] = [];
  if (SESSION_NAME.test(c.name) && !c.flags.has("httponly")) missing.push("HttpOnly");
  if (!c.flags.has("secure") && (https || c.flags.get("samesite") === "none")) missing.push("Secure");
  return missing;
}

export function findCookieFlags(r: SecurityRequest): Finding[] {
  const value = r.header("set-cookie");
  const cookies = value ? parseSetCookie(value) : null;
  if (!cookies) return [];
  return cookies.flatMap((c) => {
    const missing = missingFlags(c, r.https);
    return missing.length ? [spanFinding("cookie-flags", "warning", "A cookie is set without its safety flags", `cookie ${c.name}: missing ${missing.join(", ")}`, r.span)] : [];
  });
}
