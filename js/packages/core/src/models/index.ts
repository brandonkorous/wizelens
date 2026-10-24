import type { Executor, PageContext, PageDef, SyncExecutor } from "../scale/needs.js";
import { computePage, computePageSync, type ModelOfDef } from "../scale/run.js";
import { badgesPage } from "./badges.js";
import { databasePage } from "./database.js";
import { errorsPage } from "./errors.js";
import { insightsPage } from "./insights.js";
import { securityPage } from "./security.js";
import { logChartPage } from "./log-chart.js";
import { logPatternsPage } from "./log-patterns.js";
import { logsPage } from "./logs.js";
import { overviewPage } from "./overview.js";
import { renderingPage } from "./rendering.js";
import { requestsPage } from "./requests.js";
import { endpointPage } from "./endpoint-page.js";
import { errorPage } from "./error-page.js";
import { queryPage } from "./query-page.js";
import { routePage } from "./route-page.js";
import { servicePage } from "./service-page.js";
import { servicesPage } from "./services.js";
import { problemsPage } from "./problems.js";
import { tracesPage } from "./traces.js";
import { trafficPage } from "./traffic.js";
import { uptimePage } from "./uptime.js";
import { userPage, usersPage } from "./users.js";

export * from "./input.js";
export * from "./request-filter.js";
export * from "./error-filter.js";
export * from "./error-issues.js";
export * from "./release-rows.js";
export * from "./service-versions.js";
export * from "./release-rows.js";
export * from "./database-filter.js";
export * from "./trace-filter.js";
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
export * from "./log-patterns.js";
export * from "./log-chart.js";
export * from "./rendering.js";
export * from "./services.js";
export * from "./service-page.js";
export * from "./error-page.js";
export * from "./endpoint-page.js";
export * from "./stream-stats.js";
export * from "./query-page.js";
export * from "./route-page.js";
export * from "./insights.js";
export * from "./traces.js";
export * from "./traffic.js";
export * from "./badges.js";
export * from "./alerts.js";
export * from "./uptime.js";
export * from "./anomaly-alert.js";
export * from "./problems.js";
export * from "./problems-read.js";
export * from "./alert-rule.js";
export * from "./alert-parse.js";
export * from "./apdex.js";
export * from "./apdex-rows.js";
export * from "./slo.js";
export * from "./slo-parse.js";
export * from "./slo-report.js";
export * from "./saved.js";
export * from "./log-search.js";
export * from "./user-rows.js";
export * from "./users.js";
export * from "./security.js";
export * from "./security-groups.js";
export * from "./security-text.js";

/** Every page by name: what it needs and how its model is built. Hosts serve them at `api/models/<name>`; in-app runs them in the browser. */
export const PAGES = {
  overview: overviewPage,
  requests: requestsPage,
  traces: tracesPage,
  database: databasePage,
  rendering: renderingPage,
  errors: errorsPage,
  logs: logsPage,
  "log-patterns": logPatternsPage,
  "log-chart": logChartPage,
  services: servicesPage,
  service: servicePage,
  error: errorPage,
  endpoint: endpointPage,
  query: queryPage,
  route: routePage,
  insights: insightsPage,
  security: securityPage,
  badges: badgesPage,
  uptime: uptimePage,
  problems: problemsPage,
  users: usersPage,
  user: userPage,
  traffic: trafficPage,
} satisfies Record<string, PageDef<unknown>>;

export type PageName = keyof typeof PAGES;
export type ModelOf<P extends PageName> = ModelOfDef<(typeof PAGES)[P]>;
export const isPageName = (v: string): v is PageName => Object.hasOwn(PAGES, v);

const defOf = <P extends PageName>(page: P) => PAGES[page] as PageDef<ModelOf<P>>;

/** One page's model with a database executor. */
export const runPage = <P extends PageName>(page: P, ctx: PageContext, ex: Executor): Promise<ModelOf<P>> => computePage(defOf(page), ctx, ex);

/** One page's model with the memory executor. */
export const runPageSync = <P extends PageName>(page: P, ctx: PageContext, ex: SyncExecutor): ModelOf<P> => computePageSync(defOf(page), ctx, ex);
export * from "./security-packages.js";
