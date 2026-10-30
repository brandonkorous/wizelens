import { asWizeLens, type WizeLens as Lens, type WizeLensOptions } from "@wizeworks/lens-browser";

/** The parts of a Vue component instance this package reads. */
export interface VueComponentLike {
  $options?: { name?: string; __name?: string; __file?: string } | null;
  $parent?: VueComponentLike | null;
}

export type VueErrorHandler = (err: unknown, instance: VueComponentLike | null, info: string) => void;

/** The parts of a Vue 3 app this package uses. `app.use(WizeLensPlugin, options)` passes it. */
export interface VueAppLike {
  config: { errorHandler?: VueErrorHandler | null; globalProperties?: Record<string, unknown> };
  provide?(key: symbol, value: unknown): unknown;
  onUnmount?(cleanup: () => void): void;
}

/** The part of a vue-router 4 router this package uses. */
export interface VueRouterLike {
  afterEach(guard: (to: { fullPath: string }, from: unknown, failure?: unknown) => unknown): () => void;
}

export interface WizeLensVueOptions extends WizeLensOptions {
  /** The in-page HUD. "auto" (default) shows it when `{endpoint}/api/info` answers, as in development; false also reads nothing back. */
  hud?: boolean | "auto";
  /** The HUD shows requests at or over this many ms as "warning". Default 500. */
  slowMs?: number;
  /** A vue-router instance: each finished navigation is a page view. */
  router?: VueRouterLike;
  /** Use this running instance instead of starting one. Its own `hud` and `slowMs` stay as they are. */
  lens?: Lens;
}

/** `inject(wizeLensKey)` gives components the running instance. */
export const wizeLensKey: unique symbol = Symbol.for("wizelens");

// Parents beyond this many are left out: the nearest ones name the place well enough.
const MAX_TRAIL = 8;

/** The component's name: `name`, the SFC's own name, its file, or "Anonymous". */
export function componentName(instance: VueComponentLike | null | undefined): string {
  const o = instance?.$options;
  const file = o?.__file?.split(/[\\/]/).pop()?.replace(/\.vue$/, "");
  return o?.name || o?.__name || file || "Anonymous";
}

/** The component and its parents, outermost first: "App > Cart > PriceLine". */
export function componentTrail(instance: VueComponentLike | null | undefined): string {
  const names: string[] = [];
  for (let c = instance; c && names.length < MAX_TRAIL; c = c.$parent) names.unshift(componentName(c));
  return names.join(" > ");
}

/** Send errors Vue catches, with the component that threw. Keeps an existing handler. Returns an undo function. */
export function hookVueErrors(app: VueAppLike, lens: Lens): () => void {
  const previous = app.config.errorHandler;
  const handler: VueErrorHandler = (err, instance, info) => {
    lens.captureError(err, { "vue.component": componentName(instance), "vue.component.trail": componentTrail(instance), "vue.info": info });
    // Vue logs an error only when no handler is set: keep that when we are the only one.
    if (previous) previous(err, instance, info);
    else console.error(err);
  };
  app.config.errorHandler = handler;
  return () => {
    if (app.config.errorHandler === handler) app.config.errorHandler = previous;
  };
}

/** Each finished vue-router navigation is a page view. Returns an undo function. */
export function trackVueRouter(router: VueRouterLike, lens: Lens): () => void {
  return router.afterEach((to, _from, failure) => {
    if (!failure) lens.pageView(to.fullPath);
  });
}

/** Install with `app.use(WizeLensPlugin, options)`. Starts WizeLens and its HUD (or uses `options.lens`), hooks errors, and tracks the router. */
export const WizeLensPlugin = {
  install(app: VueAppLike, options: WizeLensVueOptions = {}): void {
    const { router, lens: given, ...rest } = options;
    const lens = given ?? asWizeLens(rest);
    app.provide?.(wizeLensKey, lens);
    if (app.config.globalProperties) app.config.globalProperties.$wizelens = lens;
    if (!lens.enabled) return;
    const undo = [hookVueErrors(app, lens), router ? trackVueRouter(router, lens) : () => {}];
    app.onUnmount?.(() => undo.forEach((u) => u()));
  },
};
