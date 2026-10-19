import { currentWizeLens, type WizeLens } from "@wizeworks/lens-browser";

export interface TrackNavigationOptions {
  /** "history" (default) for routers on the History API; "hash" for routers that keep the path after `#` (svelte-spa-router). */
  mode?: "history" | "hash";
  /** Use this instance instead of the running one. */
  lens?: WizeLens;
}

/** The router path of this page: after `#` (or `#!`) in hash mode, else the path and query. */
export function routerPath(mode: TrackNavigationOptions["mode"] = "history"): string {
  if (mode === "hash") return location.hash.replace(/^#!?/, "") || "/";
  return location.pathname + location.search;
}

/** Record route changes of a plain Svelte app as page views. Call after `initWizeLens`. Returns a stop function. */
export function trackNavigation(options: TrackNavigationOptions = {}): () => void {
  const lens = options.lens ?? currentWizeLens();
  if (!lens?.enabled || typeof addEventListener !== "function" || typeof location === "undefined") return () => {};
  const mode = options.mode ?? "history";
  // pushState is seen by WizeLens itself; back, forward, and hash changes are read here.
  const events = mode === "hash" ? ["hashchange", "popstate"] : ["popstate"];
  const onChange = () => lens.pageView(routerPath(mode));
  events.forEach((e) => addEventListener(e, onChange));
  return () => events.forEach((e) => removeEventListener(e, onChange));
}
