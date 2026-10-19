// Where alert notices may go: an https URL that does not point into the host's own network.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const isPrivate = (ip: string) => (isIP(ip) === 6 ? /^(::1|fc|fd|fe80|::ffff:(10|127|169\.254|192\.168)\.)/i.test(ip) || ip === "::" : PRIVATE_V4.some((r) => r.test(ip)));

/** A webhook may not point into the service's own network (cloud metadata, databases). Self-hosts can allow it. */
export async function checkTarget(url: string, allowPrivate: boolean): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Not a valid URL.";
  }
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) return "Use an https:// URL.";
  if (allowPrivate) return null;
  const addresses = isIP(u.hostname) ? [u.hostname] : (await lookup(u.hostname, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) return "The host name does not resolve.";
  return addresses.some(isPrivate) ? "Webhooks cannot point at private or local addresses." : null;
}
