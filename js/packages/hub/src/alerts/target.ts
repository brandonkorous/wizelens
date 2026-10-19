// Where alert notices may go: an https URL that does not point into the host's own network.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress } from "../uptime/guard.js";

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
  return addresses.some(isPrivateAddress) ? "Webhooks cannot point at private or local addresses." : null;
}
