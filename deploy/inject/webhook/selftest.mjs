// Checks the Node hook this image copies into pods: run with --import /wizelens/node/dist/auto.js. Exits 0 when a request is traced.
import { createServer } from "node:http";

const server = createServer((_req, res) => res.end("ok"));
server.listen(0, "127.0.0.1", async () => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/selftest`);
  const trace = res.headers.get("x-wizelens-trace");
  console.log(trace ? `traced ${trace}` : "not traced");
  process.exit(trace ? 0 : 1);
});
