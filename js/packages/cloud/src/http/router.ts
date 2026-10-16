import type { IncomingMessage, ServerResponse } from "node:http";

export interface RouteCtx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
}

export type Handler<C extends RouteCtx = RouteCtx> = (ctx: C) => Promise<void>;

interface Route<C extends RouteCtx> {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler<C>;
}

/** Method and path matching, with `:name` path parts. Paths are below the base path. */
export class Router<C extends RouteCtx = RouteCtx> {
  readonly #routes: Route<C>[] = [];

  on(method: string, path: string, handler: Handler<C>): this {
    const keys: string[] = [];
    const source = path.replace(/:([a-zA-Z]+)/g, (_, k: string) => (keys.push(k), "([^/]+)"));
    this.#routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handler });
    return this;
  }

  /** The handler and path params for a request, or undefined. */
  match(method: string, path: string): { handler: Handler<C>; params: Record<string, string> } | undefined {
    for (const r of this.#routes) {
      if (r.method !== method) continue;
      const m = r.pattern.exec(path);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
      return { handler: r.handler, params };
    }
    return undefined;
  }

  /** True when some route has this path with another method (for 405). */
  hasPath(path: string): boolean {
    return this.#routes.some((r) => r.pattern.test(path));
  }
}
