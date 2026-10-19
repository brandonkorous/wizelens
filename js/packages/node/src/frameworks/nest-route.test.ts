import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { hookNestApplication, hookNestFilters } from "../auto/nest.js";
import { tapErrors } from "./nest-errors.js";
import { joinRoute, nestRoute, routeMatches } from "./nest-route.js";

const define = (key: string, value: unknown, target: object) => (Reflect as unknown as { defineMetadata(k: string, v: unknown, t: object): void }).defineMetadata(key, value, target);

class ItemsController {
  list() {}
  health() {}
  files() {}
}
define("path", ["items", "products"], ItemsController);
define("__version__", ["1", "2"], ItemsController);
define("path", "", ItemsController.prototype.list);
define("path", "health", ItemsController.prototype.health);
define("__version__", Symbol("neutral"), ItemsController.prototype.health);
define("path", "files/*path", ItemsController.prototype.files);

const ctx = (handler: object) => ({ getClass: () => ItemsController, getHandler: () => handler });
const app = (prefix: string, uri = true) => ({ config: { getGlobalPrefix: () => prefix, getVersioning: () => (uri ? { type: 0 } : { type: 1 }) } });

describe("nestRoute", () => {
  it("picks the prefix, version, and controller path the request used", () => {
    expect(nestRoute(ctx(ItemsController.prototype.list), app("api"), "/api/v2/products")).toBe("/api/v2/products");
    expect(nestRoute(ctx(ItemsController.prototype.list), app("api"), "/api/v1/items/")).toBe("/api/v1/items");
    expect(nestRoute(ctx(ItemsController.prototype.files), app("api"), "/api/v1/items/files/a/b.txt")).toBe("/api/v1/items/files/*path");
  });

  it("handles a neutral version, a route excluded from the prefix, and header versioning", () => {
    expect(nestRoute(ctx(ItemsController.prototype.health), app("api"), "/items/health")).toBe("/items/health");
    expect(nestRoute(ctx(ItemsController.prototype.list), app("api", false), "/api/items")).toBe("/api/items");
    expect(nestRoute(ctx(ItemsController.prototype.list), undefined, "/elsewhere")).toBe("/items");
  });

  it("is undefined without metadata", () => {
    expect(nestRoute({ getClass: () => class {}, getHandler: () => () => {} }, app("api"), "/api")).toBeUndefined();
  });

  it("joins and matches templates", () => {
    expect(joinRoute("/api/", "", "v1", "/orders/", ":id")).toBe("/api/v1/orders/:id");
    expect(joinRoute("", "")).toBe("/");
    expect(routeMatches("/orders/:id", "/orders/7")).toBe(true);
    expect(routeMatches("/orders/:id", "/orders/7/items")).toBe(false);
    expect(routeMatches("/a{/:b}", "/a")).toBe(true);
    expect(routeMatches("/a.b", "/aXb")).toBe(false);
  });
});

describe("tapErrors", () => {
  it("returns an interop observable for a source with no class, and reports errors before passing them on", () => {
    const seen: unknown[] = [];
    const source = Object.assign(Object.create(null) as object, { subscribe: (o: { error(e: unknown): void }) => o.error("bad") });
    const out = tapErrors(source, (err) => seen.push(["hook", err])) as Record<string, () => { subscribe(o: object): unknown }>;
    out["@@observable"]!().subscribe({ error: (err: unknown) => seen.push(["subscriber", err]) });
    expect(seen).toEqual([["hook", "bad"], ["subscriber", "bad"]]);
    expect(tapErrors("plain", () => {})).toBe("plain");
  });
});

describe("the auto install's Nest hooks", () => {
  it("adds the interceptor once when a NestApplication starts", async () => {
    class NestApplication {
      interceptors: unknown[] = [];
      useGlobalInterceptors(...i: unknown[]) {
        this.interceptors.push(...i);
      }
      async init() {
        return "ready";
      }
    }
    hookNestApplication({ NestApplication });
    const nest = new NestApplication();
    expect(await nest.init()).toBe("ready");
    await nest.init();
    expect(nest.interceptors).toHaveLength(1);
  });

  it("wraps the exception handlers RouterExceptionFilters makes", () => {
    class RouterExceptionFilters {
      create() {
        return { next: () => "handled" };
      }
    }
    hookNestFilters({ RouterExceptionFilters });
    const handler = new RouterExceptionFilters().create();
    expect(handler.next()).toBe("handled");
    expect((handler.next as unknown as Record<symbol, unknown>)[Symbol.for("wizeworks.wizelens.nest-filter")]).toBe(true);
    hookNestFilters(null);
  });
});
