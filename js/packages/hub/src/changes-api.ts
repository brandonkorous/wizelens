import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiContext } from "./api.js";

// `api/changes` on the hub: the same server-sent events as the cloud, one `data` event each time settling builds new stats.
const CHECK_MS = 1_000;
const HEARTBEAT_MS = 25_000;

/** Stream until the client goes away. The hub settles every project together, so one event covers all. */
export async function streamChanges(c: ApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  res.write("retry: 5000\n\n");
  const store = c.data.store;
  let seen = store.settleGen;
  let quiet = 0;
  const timer = setInterval(() => {
    quiet += CHECK_MS;
    if (store.settleGen !== seen) (seen = store.settleGen), (quiet = 0), res.write(`event: data\ndata: ${seen}\n\n`);
    else if (quiet >= HEARTBEAT_MS) (quiet = 0), res.write(": beat\n\n");
  }, CHECK_MS);
  await new Promise<void>((resolve) => req.once("close", resolve));
  clearInterval(timer);
}
