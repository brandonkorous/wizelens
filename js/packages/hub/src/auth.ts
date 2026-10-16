import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const COOKIE = "wizelens_hub";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function cookieOf(req: IncomingMessage): string | undefined {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** True when no token is set, or the call carries it (bearer header or the dashboard cookie). */
export function isAllowed(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const auth = String(req.headers.authorization ?? "");
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const given = bearer ?? cookieOf(req);
  return given !== undefined && same(given, token);
}

/** `?token=` on a dashboard page: keep it in a cookie, then drop it from the address bar. True when handled. */
export function acceptTokenLink(url: URL, token: string | undefined, res: ServerResponse): boolean {
  const given = url.searchParams.get("token");
  if (!token || given === null) return false;
  url.searchParams.delete("token");
  const target = `${url.pathname}${url.search}`;
  if (!same(given, token)) {
    res.writeHead(302, { Location: `${target}${url.search ? "&" : "?"}denied=1` }).end();
    return true;
  }
  const cookie = `${COOKIE}=${encodeURIComponent(given)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`;
  res.writeHead(302, { Location: target, "Set-Cookie": cookie }).end();
  return true;
}

const LOGIN = (denied: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WizeLens hub</title><style>body{font-family:system-ui;background:#0f1115;color:#e8eaee;display:grid;place-items:center;min-height:100vh;margin:0}
form{display:grid;gap:12px;width:min(340px,90vw)}input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #2a2f3a}
input{background:#171a21;color:inherit}button{background:#3b82f6;color:#fff;border:0;cursor:pointer}p{margin:0;color:#9aa3b2}.e{color:#f87171}</style></head>
<body><form method="get"><h1 style="margin:0;font-size:20px">WizeLens hub</h1><p>This hub needs an access token.</p>
${denied ? '<p class="e">That token is not right.</p>' : ""}<input name="token" type="password" placeholder="Access token" autofocus required aria-label="Access token">
<button type="submit">Open the dashboard</button></form></body></html>`;

/** Answer a call without the token: JSON for the API, a small sign-in page for the dashboard. */
export function deny(res: ServerResponse, api: boolean, url: URL): void {
  if (api) {
    res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" }).end(JSON.stringify({ error: "token required" }));
    return;
  }
  res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" }).end(LOGIN(url.searchParams.has("denied")));
}
