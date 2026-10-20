// Scenario traces that set off the security rules: failed sign-ins from one address, an open admin route, and an open file. Test-only.
import type { Trace } from "../types.js";
import { client, draft, finish, log, server } from "./scenario-kit.js";

/** A sign-in that fails (401, every fifth a 429) from one address, sets a session cookie without flags, and calls a partner over plain HTTP. */
export function securityLogin(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const headers = {
    "client.address": "10.0.0.9",
    "http.request.header.x-forwarded-proto": "https",
    "http.response.header.content-type": "application/json",
    "http.response.header.x-content-type-options": "nosniff",
    "http.response.header.strict-transport-security": "max-age=31536000",
    "http.response.header.set-cookie": "sid=[redacted]; Path=/",
    ...(i % 3 === 0 ? { "http.response.header.x-powered-by": "Express" } : {}),
  };
  // Slower than the cart calls, so a cart call settled again never leaves its "last seen" time in this row.
  const srv = server(d, { at, ms: 150 + i, method: "POST", path: "/login", route: "/login", status: i % 5 === 0 ? 429 : 401, extra: headers });
  client(d, srv, at + 5, 12, "http://rates.partner.com/v1/rates?api_key=[redacted]");
  // Only in the last 3 days, so the log retention tests (4 days) never prune a line a risk was found in.
  if (i % 2 === 1 && i <= 16) log(d, at + 8, "warn", "bad token [redacted:jwt]", "api", srv.spanId);
  return finish(d);
}

/** An admin API that answers with no credentials, or an open .env file. */
export function securityAdmin(id: string, at: number, i: number): Trace {
  const d = draft(id);
  if (i % 2 === 0) server(d, { at, ms: 8, path: "/.env" });
  else server(d, { at, ms: 15, method: "POST", path: "/api/admin/flags", route: "/api/admin/flags", extra: { "http.response.header.content-type": "application/json" } });
  return finish(d);
}
