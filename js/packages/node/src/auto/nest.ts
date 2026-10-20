import { patchMethod } from "../adapters/registry.js";
import { addNestHooks } from "../frameworks/nest.js";
import { hookExceptionFilters } from "../frameworks/nest-errors.js";
import { onLoad } from "./module-hooks.js";

type Klass = { prototype?: object };

/** @nestjs/core's RouterExceptionFilters: every exception handler it makes records what Nest's filters answer. */
export function hookNestFilters(exports: unknown): void {
  const proto = (exports as { RouterExceptionFilters?: Klass } | null)?.RouterExceptionFilters?.prototype;
  if (proto) hookExceptionFilters(proto);
}

/** @nestjs/core's NestApplication: the WizeLens interceptor is added when the app starts, before its routes are made. */
export function hookNestApplication(exports: unknown): void {
  const proto = (exports as { NestApplication?: Klass } | null)?.NestApplication?.prototype;
  if (!proto) return;
  patchMethod(proto, "init", (init) =>
    function (this: unknown, ...args: unknown[]) {
      addNestHooks(this);
      return init.apply(this, args);
    }, "auto-nest");
}

/** NestJS on Express or Fastify. The request itself is captured by the server and framework hooks. */
export function hookNest(): void {
  onLoad(/\/node_modules\/@nestjs\/core\/router\/router-exception-filters\.js$/, hookNestFilters);
  onLoad(/\/node_modules\/@nestjs\/core\/nest-application\.js$/, hookNestApplication);
}
