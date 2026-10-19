import type { IncomingMessage } from "node:http";
import { Transform } from "node:stream";
import { annotateErrorFrames } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { bearerOf, fail, sendJson } from "../http/http.js";
import type { RateLimiter } from "../http/limiter.js";
import { keyByToken } from "../repo/projects.js";
import { writeService } from "../repo/trace-write.js";
import { handleOtlp, type HubWrite, type OtlpSignal, parseIngest, parseJson, readBody } from "@wizeworks/lens-hub/kit";

interface Target {
  projectId: string;
  orgId: string;
}

/** The project an ingest key writes to. Add-ons send it as WIZELENS_HUB_TOKEN; OTLP apps as a bearer header. */
async function ingestTarget(ctx: Ctx, limiter: RateLimiter): Promise<Target> {
  const token = bearerOf(ctx.req);
  if (!token?.startsWith("wl_ik_")) return fail(401, "Send an ingest key: Authorization: Bearer wl_ik_...");
  const key = await keyByToken(ctx.app.db, token, ctx.app.config.now());
  if (!key || key.kind !== "ingest") return fail(401, "This ingest key is not valid.");
  if (!limiter.take(key.id)) fail(429, "Too many calls for this key. Slow down and retry.");
  return { projectId: key.projectIds[0]!, orgId: key.orgId };
}

/** The project of an ingest key, for calls that are not telemetry (source map uploads). */
export const ingestProject = async (ctx: Ctx, limiter: RateLimiter): Promise<string> => (await ingestTarget(ctx, limiter)).projectId;

/** 429 when the organization reached its Free GB or its spend cap. Add-ons and OTLP exporters back off and retry. */
async function overLimit(ctx: Ctx, orgId: string): Promise<boolean> {
  const message = await ctx.app.billing.limits.blocked(orgId);
  if (message) sendJson(ctx.res, 429, { error: message }, { "Retry-After": "3600" });
  return !!message;
}

/** The request body as sent (before gzip is undone), counted as it is read: what a GB means on the bill. */
function counted(req: IncomingMessage): { req: IncomingMessage; bytes: () => number } {
  let n = 0;
  const pass = new Transform({ transform: (chunk: Buffer, _enc, done) => ((n += chunk.length), done(null, chunk)) });
  req.on("error", (err) => pass.destroy(err));
  req.pipe(pass);
  return { req: Object.assign(pass, { headers: req.headers, method: req.method, url: req.url }) as unknown as IncomingMessage, bytes: () => n };
}

/** The service registry stays in Postgres; spans, logs, and metrics go to the telemetry store. Each write is counted for usage. */
const save = (ctx: Ctx, t: Target) => async (w: HubWrite) => {
  const now = ctx.app.config.now();
  await writeService(ctx.app.db, t.projectId, w, now);
  await ctx.app.telemetry.write(t.projectId, w, now);
  ctx.app.billing.usage.add(t.orgId, { spans: w.spans.length, logs: w.logs.length, points: w.metrics?.length ?? 0 });
};

/** `POST api/ingest`: a WizeLens add-on batch. */
export async function ingestBatch(ctx: Ctx, limiter: RateLimiter): Promise<void> {
  const t = await ingestTarget(ctx, limiter);
  if (await overLimit(ctx, t.orgId)) return;
  const body = counted(ctx.req);
  let w: HubWrite | null;
  try {
    w = parseIngest(parseJson(await readBody(body.req)), ctx.app.config.redactKeys);
  } catch {
    return fail(400, "The body is not valid JSON.");
  }
  if (!w) fail(400, "sender.service is required.");
  // Browser errors group by their original frame: add it with the project's uploaded maps before they are stored.
  await annotateErrorFrames(w!.spans, ctx.app.maps(t.projectId));
  await save(ctx, t)(w!);
  ctx.app.billing.usage.add(t.orgId, { bytes: body.bytes() });
  ctx.res.writeHead(204).end();
}

/** `POST /v1/traces`, `/v1/logs`, and `/v1/metrics`: OpenTelemetry apps and collectors. */
export async function ingestOtlp(ctx: Ctx, signal: OtlpSignal, limiter: RateLimiter): Promise<void> {
  const t = await ingestTarget(ctx, limiter);
  if (await overLimit(ctx, t.orgId)) return;
  const body = counted(ctx.req);
  await handleOtlp(signal, body.req, ctx.res, save(ctx, t), ctx.app.config.redactKeys);
  if (ctx.res.statusCode === 200) ctx.app.billing.usage.add(t.orgId, { bytes: body.bytes() });
}
