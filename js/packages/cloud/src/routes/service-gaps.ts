import type { Ctx } from "../app.js";
import { requireProject } from "../auth/principal.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { sendGaps } from "../repo/service-minutes.js";

const DAY_MS = 86_400_000;

/** `GET api/projects/<id>/service-gaps?service=&from=&to=&env=`: times the service sent nothing, not even a heartbeat. */
async function gaps(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const q = ctx.url.searchParams;
  const service = q.get("service") ?? fail(400, "Name the service.");
  const now = ctx.app.config.now();
  const toMs = Number(q.get("to")) || now;
  const fromMs = Number(q.get("from")) || toMs - DAY_MS;
  if (fromMs >= toMs) fail(400, "from must be before to.");
  sendJson(ctx.res, 200, { gaps: await sendGaps(ctx.app.db, project.id, service, { fromMs, toMs, env: q.get("env") || null }, now) });
}

export function serviceGapRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/service-gaps", gaps);
}
