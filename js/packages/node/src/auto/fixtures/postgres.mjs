// A node:http app on postgres.js, loaded as an ES module and as CommonJS, with no WizeLens code. Nothing listens on port 1, so each query fails fast.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import postgres from "postgres";

const options = { host: "127.0.0.1", port: 1, max: 1, connect_timeout: 2 };
const esm = postgres(options);
const cjs = createRequire(import.meta.url)("postgres")(options);

const server = createServer(async (req, res) => {
  const sql = req.url === "/cjs" ? cjs : esm;
  res.end(await sql`SELECT * FROM orders WHERE id = ${1}`.then(() => "ok", () => "failed"));
});
server.listen(0, () => console.log(`ready ${server.address().port}`));
