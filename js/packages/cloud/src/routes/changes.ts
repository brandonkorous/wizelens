import type { Ctx } from "../app.js";
import type { Router } from "../http/router.js";
import { projectOf } from "./data.js";

/** A comment line now and then, so proxies keep the stream open. */
const HEARTBEAT_MS = 25_000;

/** `GET api/changes?project=`: a server-sent event `data` each time the project gets new stats, for the dashboard to reload. */
async function changes(ctx: Ctx): Promise<void> {
  const { project } = await projectOf(ctx);
  const res = ctx.res;
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 5000\n\n");
  const stop = ctx.app.changes.subscribe(project.id, () => res.write(`event: data\ndata: ${Date.now()}\n\n`));
  const beat = setInterval(() => res.write(": beat\n\n"), HEARTBEAT_MS);
  await new Promise<void>((resolve) => ctx.req.once("close", resolve));
  clearInterval(beat);
  stop();
}

export function changeRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/changes", changes);
}
