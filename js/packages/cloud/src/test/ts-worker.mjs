// Tests only: lets a worker thread run the TypeScript sources, whose imports name the built .js files.
import { register } from "node:module";

const hooks = `export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || !spec.startsWith(".") || !spec.endsWith(".js")) throw err;
    return next(spec.slice(0, -3) + ".ts", ctx);
  }
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
