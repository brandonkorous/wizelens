import type { IncomingMessage, ServerResponse } from "node:http";
import { toNodeHandler } from "better-auth/node";
import type { WizeAuth } from "./auth.js";
import { AUTH_BASE_PATH, CLIENT_IP_HEADER } from "./options.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
/** Paths an outside party posts to (sign-in providers), which cannot send the dashboard header. None are on yet; SSO adds them. */
const EXTERNAL: RegExp[] = [/^\/callback\/[^/]+$/, /^\/sso\/callback(\/[^/]+)?$/, /^\/sso\/saml2\/sp\/(acs|slo)\/[^/]+$/];
const IP_HEADERS = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip", "forwarded", CLIENT_IP_HEADER];
const MAX_BODY = 64 * 1024;
const MAX_EXTERNAL_BODY = 1024 * 1024;

/** The caller's address: the socket, or (behind a proxy we run) the last address that proxy added to X-Forwarded-For. */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = trustProxy && forwarded.length ? forwarded[forwarded.length - 1]! : (req.socket.remoteAddress ?? "");
  return ip.replace(/^::ffff:/, "");
}

function deny(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: message, message }));
}

/** Better Auth below `/_wizelens/api/auth/`: our dashboard header on changes, a body limit, and our own client-address header. */
export function authHandler(auth: WizeAuth, trustProxy: boolean) {
  const handler = toNodeHandler(auth);
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://cloud.local").pathname.slice(AUTH_BASE_PATH.length);
    const external = EXTERNAL.some((r) => r.test(path));
    if (!SAFE.has(req.method ?? "GET")) {
      if (!external && req.headers["x-wizelens-client"] !== "dashboard") return deny(res, 403, "Missing the X-WizeLens-Client header.");
      const length = Number(req.headers["content-length"] ?? 0);
      if (req.headers["transfer-encoding"] || length > (external ? MAX_EXTERNAL_BODY : MAX_BODY)) return deny(res, 413, "The body is too large.");
    }
    const ip = clientIp(req, trustProxy);
    for (const h of IP_HEADERS) delete req.headers[h];
    req.headers[CLIENT_IP_HEADER] = ip;
    await handler(req, res);
  };
}
