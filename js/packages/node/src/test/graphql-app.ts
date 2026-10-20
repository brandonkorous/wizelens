import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { WizeLens } from "../types.js";
import { type Running, startApp } from "./helpers.js";

type Resolver = (...args: unknown[]) => unknown;

/** The fake graphql package: graphql 16's CommonJS layout (getters on the index), with a tiny parser and schema. */
export interface FakeGraphql {
  execute(args: { schema: unknown; document: unknown; operationName?: string; variableValues?: unknown }): Promise<{ data?: unknown; errors?: unknown[] }>;
  parse(body: string): unknown;
  makeSchema(query: Record<string, Resolver>, mutation?: Record<string, Resolver>): unknown;
}

export interface FakeInstall {
  graphql: FakeGraphql;
  require: NodeJS.Require;
  remove(): void;
}

/** Copy the fake graphql package into a new node_modules folder and require it from there. */
export function installFakeGraphql(): FakeInstall {
  const root = mkdtempSync(join(tmpdir(), "wizelens-graphql-"));
  cpSync(fileURLToPath(new URL("./fake-graphql", import.meta.url)), join(root, "node_modules", "graphql"), { recursive: true });
  const require = createRequire(join(root, "app.js"));
  return { graphql: require("graphql") as FakeGraphql, require, remove: () => rmSync(root, { recursive: true, force: true }) };
}

/** An Express app that answers POST /graphql the way Apollo's middleware does: mounted with `use`, so Express knows no route. */
export function startGraphqlApp(wizelens: WizeLens, graphql: FakeGraphql, schema: unknown): Promise<Running> {
  return startApp(wizelens, (app) => {
    app.use(express.json());
    app.use("/graphql", (req, res, next) => {
      const { query, operationName, variables } = req.body as { query: string; operationName?: string; variables?: unknown };
      graphql
        .execute({ schema, document: graphql.parse(query), operationName, variableValues: variables })
        .then((result) => res.json(result), next);
    });
  });
}

/** POST one GraphQL request. */
export const postQuery = (base: string, query: string, variables?: Record<string, unknown>): Promise<Response> =>
  fetch(`${base}/graphql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
