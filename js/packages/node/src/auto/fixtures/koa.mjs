// A Koa app with @koa/router and winston, and no WizeLens code.
import Router from "@koa/router";
import Koa from "koa";
import winston from "winston";

const logger = winston.createLogger({ transports: [new winston.transports.Console({ silent: true })] });
const app = new Koa();
const router = new Router();
router.get("/carts/:id", (ctx) => {
  logger.info("reading cart");
  ctx.body = { id: ctx.params.id };
});
router.get("/boom", () => {
  throw new Error("koa boom");
});
app.silent = true;
app.use(router.routes());
const server = app.listen(0, () => console.log(`ready ${server.address().port}`));
