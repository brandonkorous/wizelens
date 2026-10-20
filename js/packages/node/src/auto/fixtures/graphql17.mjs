// An Express app that answers GraphQL with the real graphql 17, imported as an ES module, and no WizeLens code.
import express from "express";
import { buildSchema, execute, parse } from "graphql";

const schema = buildSchema("type Query { orders(status: String): [Int] }");
const rootValue = { orders: () => [1, 2] };

const app = express();
app.use("/graphql", async (req, res) => {
  res.json(await execute({ schema, document: parse(String(req.query.query)), rootValue }));
});
const server = app.listen(0, () => console.log(`ready ${server.address().port}`));
