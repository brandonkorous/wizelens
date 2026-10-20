// An Express app that answers GraphQL with a fake graphql package (graphql 16's CommonJS layout plus an ES module execute), and no WizeLens code.
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";

const root = join(tmpdir(), "wizelens-auto-graphql");
const dir = join(root, "node_modules", "graphql");
cpSync(fileURLToPath(new URL("../../test/fake-graphql", import.meta.url)), dir, { recursive: true });
const graphql = createRequire(join(root, "app.js"))("graphql");
const esm = await import(pathToFileURL(join(dir, "execution", "execute.mjs")).href);
const schema = graphql.makeSchema({ orders: () => [{ id: 1 }] });

const app = express();
app.use("/graphql", async (req, res) => {
  const execute = req.query.esm ? esm.execute : graphql.execute;
  res.json(await execute({ schema, document: graphql.parse(String(req.query.query)) }));
});
const server = app.listen(0, () => console.log(`ready ${server.address().port}`));
