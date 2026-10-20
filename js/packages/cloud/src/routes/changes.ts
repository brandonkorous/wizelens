import type { Ctx } from "../app.js";
import type { Router } from "../http/router.js";
import { readScopeOf } from "./scope.js";

/** A comment line now and then, so proxies keep the stream open. */
const HEARTBEAT_MS = 25_000;

/** `GET api/changes?project=` (or `project=all&org=`): a server-sent event `data` each time a project read gets new stats, for the dashboard to reload. */
async function changes(ctx: Ctx): Promise<void> {
  const { projects } = await readScopeOf(ctx);
  const res = ctx.res;
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 5000\n\n");
  const send = () => res.write(`event: data\ndata: ${Date.now()}\n\n`);
  const stops = projects.map((p) => ctx.app.changes.subscribe(p.id, send));
  const beat = setInterval(() => res.write(": beat\n\n"), HEARTBEAT_MS);
  await new Promise<void>((resolve) => ctx.req.once("close", resolve));
  clearInterval(beat);
  for (const stop of stops) stop();
}

export function changeRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/changes", changes);
}
