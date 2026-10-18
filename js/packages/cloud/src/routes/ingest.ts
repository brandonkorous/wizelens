import type { Ctx } from "../app.js";
import { bearerOf, fail } from "../http/http.js";
import type { RateLimiter } from "../http/limiter.js";
import { keyByToken } from "../repo/projects.js";
import { writeService } from "../repo/trace-write.js";
import { handleOtlp, type HubWrite, type OtlpSignal, parseIngest, parseJson, readBody } from "@wizeworks/lens-hub/kit";

/** The project an ingest key writes to. Add-ons send it as WIZELENS_HUB_TOKEN; OTLP apps as a bearer header. */
async function ingestProject(ctx: Ctx, limiter: RateLimiter): Promise<string> {
  const token = bearerOf(ctx.req);
  if (!token?.startsWith("wl_ik_")) return fail(401, "Send an ingest key: Authorization: Bearer wl_ik_...");
  const key = await keyByToken(ctx.app.db, token, ctx.app.config.now());
  if (!key || key.kind !== "ingest") return fail(401, "This ingest key is not valid.");
  if (!limiter.take(key.id)) fail(429, "Too many calls for this key. Slow down and retry.");
  return key.projectIds[0]!;
}

/** The service registry stays in Postgres; spans, logs, and metrics go to the telemetry store. */
const save = (ctx: Ctx, projectId: string) => async (w: HubWrite) => {
  const now = ctx.app.config.now();
  await writeService(ctx.app.db, projectId, w, now);
  await ctx.app.telemetry.write(projectId, w, now);
};

/** `POST api/ingest`: a WizeLens add-on batch. */
export async function ingestBatch(ctx: Ctx, limiter: RateLimiter): Promise<void> {
  const projectId = await ingestProject(ctx, limiter);
  let w: HubWrite | null;
  try {
    w = parseIngest(parseJson(await readBody(ctx.req)), ctx.app.config.redactKeys);
  } catch {
    return fail(400, "The body is not valid JSON.");
  }
  if (!w) fail(400, "sender.service is required.");
  await save(ctx, projectId)(w!);
  ctx.res.writeHead(204).end();
}

/** `POST /v1/traces` and `/v1/logs`: OpenTelemetry apps. */
export async function ingestOtlp(ctx: Ctx, signal: OtlpSignal, limiter: RateLimiter): Promise<void> {
  const projectId = await ingestProject(ctx, limiter);
  await handleOtlp(signal, ctx.req, ctx.res, save(ctx, projectId), ctx.app.config.redactKeys);
}

