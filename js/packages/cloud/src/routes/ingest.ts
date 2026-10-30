import type { IncomingMessage } from "node:http";
import { Transform } from "node:stream";
import { annotateErrorFrames, redactSignals } from "@wizeworks/lens-core/internal";
import type { Ctx } from "../app.js";
import { bearerOf, fail, sendJson } from "../http/http.js";
import type { RateLimiter } from "../http/limiter.js";
import { type ApiKey, type IngestScope, keyAllows, keyByToken } from "../repo/projects.js";
import { writeService } from "../repo/trace-write.js";
import { handleOtlp, type HubWrite, type OtlpSignal, parseIngest, parseJson, readBody } from "@wizeworks/lens-hub/internal";

export type IngestKey = ApiKey & { orgId: string };

/** The ingest key of the call. Add-ons send it from WIZELENS_TOKEN, OTLP apps as a bearer header. */
async function ingestKey(ctx: Ctx, limiter: RateLimiter): Promise<IngestKey> {
  const token = bearerOf(ctx.req);
  if (!token?.startsWith("wl_ik_")) return fail(401, "Send an ingest key: Authorization: Bearer wl_ik_...");
  const key = await keyByToken(ctx.app.db, token, ctx.app.config.now());
  if (!key || key.kind !== "ingest") return fail(401, "This ingest key is not valid, or it expired.");
  if (!limiter.take(key.id)) fail(429, "Too many calls for this key. Slow down and retry.");
  return key;
}

/** The project of an ingest key, for calls that are not telemetry (source map uploads). */
export const ingestProject = async (ctx: Ctx, limiter: RateLimiter): Promise<string> => (await ingestKey(ctx, limiter)).projectIds[0]!;

/** 429 when the organization reached its Free GB or its spend cap. Add-ons and OTLP exporters back off and retry. */
export async function overLimit(ctx: Ctx, orgId: string): Promise<boolean> {
  const message = await ctx.app.billing.limits.blocked(orgId);
  if (message) sendJson(ctx.res, 429, { error: message }, { "Retry-After": "3600" });
  return !!message;
}

/** The request body as sent (before gzip is undone), counted as it is read: what a GB means on the bill. */
export function counted(req: IncomingMessage): { req: IncomingMessage; bytes: () => number } {
  let n = 0;
  const pass = new Transform({ transform: (chunk: Buffer, _enc, done) => ((n += chunk.length), done(null, chunk)) });
  req.on("error", (err) => pass.destroy(err));
  req.pipe(pass);
  return { req: Object.assign(pass, { headers: req.headers, method: req.method, url: req.url }) as unknown as IncomingMessage, bytes: () => n };
}

/** Only the signals the key may send, with the project's extra keys hidden too. */
async function allowed(ctx: Ctx, key: IngestKey, w: HubWrite): Promise<HubWrite> {
  const may = (s: IngestScope) => keyAllows(key, s);
  const own = (await ctx.app.settings.get(key.projectIds[0]!)).redactKeys;
  return redactSignals({ ...w, spans: may("traces") ? w.spans : [], logs: may("logs") ? w.logs : [], metrics: may("metrics") ? w.metrics : [] }, own);
}

/** The service registry stays in Postgres; spans, logs, and metrics go to the telemetry store. Each write is counted for usage. */
export const save = (ctx: Ctx, key: IngestKey) => async (raw: HubWrite) => {
  const now = ctx.app.config.now();
  const projectId = key.projectIds[0]!;
  const w = await allowed(ctx, key, raw);
  await writeService(ctx.app.db, projectId, w, now);
  await ctx.app.telemetry.write(projectId, w, now);
  ctx.app.billing.usage.add(key.orgId, { spans: w.spans.length, logs: w.logs.length, points: w.metrics?.length ?? 0 });
};

/** `POST api/ingest`: a WizeLens add-on batch. */
export async function ingestBatch(ctx: Ctx, limiter: RateLimiter): Promise<void> {
  const key = await ingestKey(ctx, limiter);
  if (await overLimit(ctx, key.orgId)) return;
  const body = counted(ctx.req);
  let w: HubWrite | null;
  try {
    w = parseIngest(parseJson(await readBody(body.req)), ctx.app.config.redactKeys);
  } catch {
    return fail(400, "The body is not valid JSON.");
  }
  if (!w) fail(400, "sender.service is required.");
  // Browser errors group by their original frame: add it with the project's uploaded maps before they are stored.
  await annotateErrorFrames(w!.spans, ctx.app.maps(key.projectIds[0]!));
  await save(ctx, key)(w!);
  ctx.app.billing.usage.add(key.orgId, { bytes: body.bytes() });
  ctx.res.writeHead(204).end();
}

/** `POST /v1/traces`, `/v1/logs`, and `/v1/metrics`: OpenTelemetry apps and collectors. A key may be limited to some of them. */
export async function ingestOtlp(ctx: Ctx, signal: OtlpSignal, limiter: RateLimiter): Promise<void> {
  const key = await ingestKey(ctx, limiter);
  if (!keyAllows(key, signal)) fail(403, `This ingest key may not send ${signal}.`);
  if (await overLimit(ctx, key.orgId)) return;
  const body = counted(ctx.req);
  await handleOtlp(signal, body.req, ctx.res, save(ctx, key), ctx.app.config.redactKeys);
  if (ctx.res.statusCode === 200) ctx.app.billing.usage.add(key.orgId, { bytes: body.bytes() });
}
