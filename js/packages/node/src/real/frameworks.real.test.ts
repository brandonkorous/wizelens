import "reflect-metadata";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { Controller, Get, Module, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import { instrumentGraphql } from "../graphql/index.js";
import { instrumentNest } from "../frameworks/nest.js";
import { startApp } from "../test/helpers.js";
import { REAL, realLens, traceOf } from "./real.js";

const wizelens = realLens("real-frameworks");
const closers: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  for (const close of closers) await close().catch(() => undefined);
  await wizelens.shutdown();
});

const serverSpan = (t: { spans: { kind: string; name: string; attributes: Record<string, unknown> }[] }) => t.spans.find((s) => s.kind === "server")!;

/** A real Nest 12 controller, decorated by calling the decorators (no compiler support needed). */
function nestModule() {
  class OrdersController {
    find(id: string) {
      if (id === "404") throw new NotFoundException("no such order");
      return { id };
    }
    secret() {
      return "never";
    }
  }
  const proto = OrdersController.prototype as unknown as Record<string, unknown>;
  const deny = { canActivate: () => false };
  Param("id")(proto, "find", 0);
  Get(":id")(proto, "find", Object.getOwnPropertyDescriptor(proto, "find")!);
  Get("admin/secret")(proto, "secret", Object.getOwnPropertyDescriptor(proto, "secret")!);
  UseGuards(deny)(proto, "secret", Object.getOwnPropertyDescriptor(proto, "secret")!);
  Controller("orders")(OrdersController);
  class AppModule {}
  Module({ controllers: [OrdersController] })(AppModule);
  return AppModule;
}

describe.skipIf(!REAL)("real frameworks", { timeout: 30_000 }, () => {
  it("nest: endpoints use the route template with the prefix, and guard and handler errors are recorded", async () => {
    const app = await NestFactory.create(nestModule(), { logger: false });
    app.setGlobalPrefix("api");
    expect(instrumentNest(wizelens, app)).toBe(true);
    await app.listen(0, "127.0.0.1");
    closers.push(() => app.close());
    const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    expect((await fetch(`${base}/api/orders/7`)).status).toBe(200);
    expect((await fetch(`${base}/api/orders/404`)).status).toBe(404);
    expect((await fetch(`${base}/api/orders/admin/secret`)).status).toBe(403);
    const ok = serverSpan(await traceOf(wizelens, (t) => t.spans.some((s) => s.kind === "server" && s.attributes["url.path"] === "/api/orders/7")));
    expect(ok.attributes["http.route"]).toBe("/api/orders/:id");
    expect(ok.attributes["nest.controller"]).toBe("OrdersController");
    const missing = serverSpan(await traceOf(wizelens, (t) => t.spans.some((s) => s.kind === "server" && s.attributes["url.path"] === "/api/orders/404")));
    expect(missing.attributes["http.response.status_code"]).toBe(404);
    const denied = await traceOf(wizelens, (t) => t.spans.some((s) => s.kind === "server" && s.attributes["url.path"] === "/api/orders/admin/secret"));
    expect(JSON.stringify(denied.spans)).toContain("ForbiddenException");
  });

  it("graphql 17: each operation is a span, named endpoint, and literal values are hidden", async () => {
    const graphql = createRequire(import.meta.url)("graphql") as typeof import("graphql");
    expect(instrumentGraphql(wizelens, graphql)).toBe(true);
    const schema = graphql.buildSchema("type Query { order(id: ID!): String, boom: String }");
    const rootValue = { order: ({ id }: { id: string }) => `order ${id}`, boom: () => { throw new Error("resolver failed"); } };
    const app = await startApp(wizelens, (a) => {
      a.use(express.json());
      a.use("/graphql", (req, res, next) => {
        const { query, operationName } = req.body as { query: string; operationName?: string };
        Promise.resolve(graphql.execute({ schema, document: graphql.parse(query), rootValue, operationName })).then((r) => res.json(r), next);
      });
    });
    closers.push(() => app.close());
    const post = (query: string) => fetch(`${app.base}/graphql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
    expect((await post('query GetOrder { order(id: "secret-id-99") }')).status).toBe(200);
    await post("query Broken { boom }");
    const get = await traceOf(wizelens, (t) => t.spans.some((s) => s.name === "query GetOrder"));
    expect(serverSpan(get).attributes["http.route"]).toContain("(GetOrder)");
    expect(JSON.stringify(get.spans)).not.toContain("secret-id-99");
    const broken = await traceOf(wizelens, (t) => t.spans.some((s) => s.name === "query Broken"));
    expect(broken.spans.find((s) => s.name === "query Broken")!.status).toBe("error");
  });
});
