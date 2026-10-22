// Browser keys: a page with no WizeLens server (a static site) sends here. The key is public: browser data only, from its sites only.
import { annotateErrorFrames, type HubLog, type Span } from "@wizeworks/lens-core";
import { type HubWrite, MAX_BODY, parseJson, readBody } from "@wizeworks/lens-hub/kit";
import { browserClockOffset, sanitizeClientLog, sanitizeClientSpan } from "@wizeworks/lens-node/kit";
import type { Ctx } from "../app.js";
import { clientIp } from "../auth/bridge.js";
import { fail } from "../http/http.js";
import type { RateLimiter } from "../http/limiter.js";
import { originAllowed } from "../repo/key-origins.js";
import { keyByToken } from "../repo/projects.js";
import { counted, type IngestKey, overLimit, save } from "./ingest.js";

/** `b/<browser key>/api/client-spans` below `/_wizelens/`: the path a page's sender posts to. */
const PATH = /^b\/(wl_bk_[A-Za-z0-9_-]{16,64})\/api\/client-spans$/;
const MAX_ITEMS = 500;
const MAX_BROWSER_BODY = Math.min(MAX_BODY, 1024 * 1024);

/** The browser key in a path below `/_wizelens/`, or null when the path is not the browser intake. */
export const browserKeyOf = (sub: string): string | null => PATH.exec(sub)?.[1] ?? null;

export interface BrowserLimits {
  /** Per key: shared with ingest keys, so a key's cap is the same wherever it sends. */
  key: RateLimiter;
  /** Per key and visitor address, so one visitor cannot use up a site's whole cap. */
  visitor: RateLimiter;
}

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

/** The live browser key for the token, when the page's site is one of its sites. Sets the CORS headers for that site. */
async function browserKey(ctx: Ctx, token: string): Promise<IngestKey> {
  const key = await keyByToken(ctx.app.db, token, ctx.app.config.now());
  if (!key || key.kind !== "browser") return fail(401, "This browser key is not valid, or it expired.");
  const origin = ctx.req.headers.origin;
  if (!originAllowed(key.origins, origin)) return fail(403, "This site may not send with this browser key. Add it to the key's sites.");
  for (const [name, value] of Object.entries(corsHeaders(origin!))) ctx.res.setHeader(name, value);
  return key;
}

/** Browser data only: every span is a browser span, every line a browser line. A public key cannot write server or database spans. */
function browserWrite(body: Record<string, unknown>, redactKeys: readonly string[], now: number): HubWrite {
  const shiftMs = browserClockOffset(body.sentAt, now);
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
  const spans = list(body.spans)
    .map((raw) => sanitizeClientSpan(raw, redactKeys, shiftMs))
    .filter((s): s is Span => s !== null)
    .map((s): Span => ({ ...s, service: "browser", category: "browser", kind: s.kind === "server" ? "client" : s.kind }));
  const logs = list(body.logs)
    .map((raw) => sanitizeClientLog(raw, redactKeys, shiftMs))
    .filter((l): l is HubLog => l !== null)
    .map((l): HubLog => ({ ...l, log: { ...l.log, service: "browser" } }));
  return { sender: { service: "browser", runtime: "browser" }, via: "addon", spans, logs, remotes: [], metrics: [] };
}

/** `OPTIONS`: the CORS check a browser makes first for a JSON post. Answers only for the key's sites. */
async function preflight(ctx: Ctx, token: string): Promise<void> {
  await browserKey(ctx, token);
  ctx.res.writeHead(204).end();
}

async function intake(ctx: Ctx, token: string, limits: BrowserLimits): Promise<void> {
  const key = await browserKey(ctx, token);
  const visitor = `${key.id}:${clientIp(ctx.req, ctx.app.config.trustProxy)}`;
  if (!limits.key.take(key.id) || !limits.visitor.take(visitor)) fail(429, "Too many calls for this key. Slow down and retry.");
  if (await overLimit(ctx, key.orgId)) return;
  const body = counted(ctx.req);
  let raw: unknown;
  try {
    raw = parseJson(await readBody(body.req, MAX_BROWSER_BODY));
  } catch {
    return fail(400, "The body is not valid JSON.");
  }
  if (!raw || typeof raw !== "object") return fail(400, "Send { spans, logs }.");
  const w = browserWrite(raw as Record<string, unknown>, ctx.app.config.redactKeys, ctx.app.config.now());
  await annotateErrorFrames(w.spans, ctx.app.maps(key.projectIds[0]!));
  if (w.spans.length > 0 || w.logs.length > 0) await save(ctx, key)(w);
  ctx.app.billing.usage.add(key.orgId, { bytes: body.bytes() });
  ctx.res.writeHead(204).end();
}

/** The browser intake: `OPTIONS` and `POST` on `b/<key>/api/client-spans`. */
export function ingestBrowser(ctx: Ctx, token: string, limits: BrowserLimits): Promise<void> {
  if (ctx.req.method === "OPTIONS") return preflight(ctx, token);
  if (ctx.req.method !== "POST") return fail(405, "POST page data here.");
  return intake(ctx, token, limits);
}
