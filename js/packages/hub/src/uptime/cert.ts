import { isIP } from "node:net";
import { connect } from "node:tls";
import { bareHost, checkLiteral, guardedLookup } from "./guard.js";

/** True for errors about the server's certificate (expired, self-signed, wrong name), not the network. */
export const isCertError = (err: unknown): boolean => /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/i.test(String((err as { code?: string })?.code ?? ""));

/** A bare TLS handshake that sends nothing, to read when a certificate the request refused ends. Null when it cannot tell. */
export function probeCertEnd(raw: string, allowPrivate: boolean, timeoutMs: number): Promise<number | null> {
  const url = new URL(raw);
  try {
    checkLiteral(url, allowPrivate);
  } catch {
    return Promise.resolve(null);
  }
  const host = bareHost(url);
  return new Promise((resolve) => {
    const socket = connect({ host, port: Number(url.port) || 443, ...(isIP(host) ? {} : { servername: host }), rejectUnauthorized: false, lookup: guardedLookup(allowPrivate), timeout: timeoutMs }, () => {
      const end = Date.parse(socket.getPeerCertificate()?.valid_to ?? "");
      socket.destroy();
      resolve(Number.isFinite(end) ? end : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => (socket.destroy(), resolve(null)));
  });
}
