import { type HonoContextLike, honoRoute } from "../frameworks/hono.js";
import { esmPatch } from "./esm-source.js";
import { recordRequestError, setRouteOf } from "./http.js";
import { onEsm, onEsmBinding, onLoad } from "./module-hooks.js";

type HonoNext = () => Promise<void>;
interface HonoLike {
  router?: object;
  use?: (handler: (c: HonoContextLike, next: HonoNext) => Promise<void>) => unknown;
}

const MARK = Symbol.for("wizeworks.wizelens.auto.hono");
const routers = new WeakSet<object>();

/** Names the route and records the error. Hono only sets `c.error` for requests that pass a middleware, so this is one. */
async function autoMiddleware(c: HonoContextLike, next: HonoNext): Promise<void> {
  const incoming = c.env?.incoming;
  if (incoming) setRouteOf(incoming, () => honoRoute(c));
  await next();
  if (incoming && c.error) recordRequestError(incoming, c.error);
}

/** The Hono class, with the middleware added first on every app that has its own router. */
function honoClass(Base: unknown): unknown {
  if (typeof Base !== "function" || (Base as unknown as Record<symbol, unknown>)[MARK]) return undefined;
  class Hono extends (Base as new (...args: unknown[]) => HonoLike) {
    constructor(...args: unknown[]) {
      super(...args);
      if (!this.router || routers.has(this.router) || typeof this.use !== "function") return;
      routers.add(this.router);
      this.use(autoMiddleware);
    }
  }
  Object.defineProperty(Hono, MARK, { value: true });
  return Hono;
}

/** Hono on @hono/node-server, from its CommonJS or its ES module build. */
export function hookHono(): void {
  onLoad(/\/node_modules\/hono\/dist\/cjs\/hono\.js$/, (exports) => {
    const e = exports as { Hono?: unknown };
    const next = honoClass(e.Hono);
    if (next) e.Hono = next;
  });
  onEsm(esmPatch(/\/node_modules\/hono\/dist\/hono\.js$/, "hono", "Hono", true));
  onEsmBinding("hono", honoClass);
}
