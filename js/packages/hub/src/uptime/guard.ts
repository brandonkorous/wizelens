import { lookup } from "node:dns";
import { isIP, type LookupFunction } from "node:net";

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^192\.0\.0\./, /^198\.1[89]\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^(22[4-9]|2[3-5]\d)\./,
];
const PRIVATE_V6 = /^(::1?$|fc|fd|fe[89ab]|::ffff:(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.)/i;

/** Loopback, private, link-local (cloud metadata), carrier-grade NAT, multicast, and reserved addresses. */
export const isPrivateAddress = (ip: string): boolean => (isIP(ip) === 6 ? PRIVATE_V6.test(ip) : PRIVATE_V4.some((r) => r.test(ip)));

export class BlockedAddressError extends Error {
  constructor(host: string) {
    super(`${host} is a private or local address, which checks from here cannot reach.`);
  }
}

/** The host of a URL without IPv6 brackets. */
export const bareHost = (u: URL): string => u.hostname.replace(/^\[|\]$/g, "");

/** A DNS lookup that refuses private addresses unless they are allowed, so a check cannot reach the host's own network. */
export function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (host, options, callback) => {
    lookup(host, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 4);
      const list = addresses as unknown as { address: string; family: number }[];
      if (!allowPrivate && list.some((a) => isPrivateAddress(a.address))) return callback(new BlockedAddressError(host), "", 4);
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
      callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

/** Refuse a literal private address up front: connections to an IP skip the lookup. */
export function checkLiteral(u: URL, allowPrivate: boolean): void {
  const host = bareHost(u);
  if (!allowPrivate && isIP(host) && isPrivateAddress(host)) throw new BlockedAddressError(host);
}
