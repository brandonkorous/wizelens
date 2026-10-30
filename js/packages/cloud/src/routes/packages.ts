// `POST api/packages` with an ingest key: the packages a service runs, for the known-vulnerability check (docs/CONTRACT.md "Packages").
import { receivePackages } from "@wizeworks/lens-hub/internal";
import type { Ctx } from "../app.js";
import type { RateLimiter } from "../http/limiter.js";
import { pgPackages } from "../repo/packages.js";
import { ingestProject } from "./ingest.js";

export async function ingestPackages(ctx: Ctx, limiter: RateLimiter): Promise<void> {
  const project = await ingestProject(ctx, limiter);
  await receivePackages(pgPackages(ctx.app.db), ctx.req, ctx.res, ctx.app.config.now(), project);
}
