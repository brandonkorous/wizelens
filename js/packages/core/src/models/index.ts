import type { Executor, PageContext, PageDef, SyncExecutor } from "../scale/needs.js";
import { computePage, computePageSync, type ModelOfDef } from "../scale/run.js";
import { badgesPage } from "./badges.js";
import { databasePage } from "./database.js";
import { errorsPage } from "./errors.js";
import { insightsPage } from "./insights.js";
import { logsPage } from "./logs.js";
import { overviewPage } from "./overview.js";
import { renderingPage } from "./rendering.js";
import { requestsPage } from "./requests.js";
import { servicePage } from "./service-page.js";
import { servicesPage } from "./services.js";
import { tracesPage } from "./traces.js";

export * from "./input.js";
export * from "./request-filter.js";
export * from "./service-detail.js";
export * from "./headlines.js";
export * from "./insight-groups.js";
export * from "./render-rows.js";
export * from "./service-rows.js";
export * from "./overview.js";
export * from "./requests.js";
export * from "./database.js";
export * from "./errors.js";
export * from "./logs.js";
export * from "./rendering.js";
export * from "./services.js";
export * from "./service-page.js";
export * from "./insights.js";
export * from "./traces.js";
export * from "./badges.js";
export * from "./alerts.js";

/** Every page by name: what it needs and how its model is built. Hosts serve them at `api/models/<name>`; in-app runs them in the browser. */
export const PAGES = {
  overview: overviewPage,
  requests: requestsPage,
  traces: tracesPage,
  database: databasePage,
  rendering: renderingPage,
  errors: errorsPage,
  logs: logsPage,
  services: servicesPage,
  service: servicePage,
  insights: insightsPage,
  badges: badgesPage,
} satisfies Record<string, PageDef<unknown>>;

export type PageName = keyof typeof PAGES;
export type ModelOf<P extends PageName> = ModelOfDef<(typeof PAGES)[P]>;
export const isPageName = (v: string): v is PageName => Object.hasOwn(PAGES, v);

const defOf = <P extends PageName>(page: P) => PAGES[page] as PageDef<ModelOf<P>>;

/** One page's model with a database executor. */
export const runPage = <P extends PageName>(page: P, ctx: PageContext, ex: Executor): Promise<ModelOf<P>> => computePage(defOf(page), ctx, ex);

/** One page's model with the memory executor. */
export const runPageSync = <P extends PageName>(page: P, ctx: PageContext, ex: SyncExecutor): ModelOf<P> => computePageSync(defOf(page), ctx, ex);
