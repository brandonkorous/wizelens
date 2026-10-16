import { databaseModel } from "./database.js";
import { errorsModel } from "./errors.js";
import type { ModelInput } from "./input.js";
import { insightsModel } from "./insights.js";
import { logsModel } from "./logs.js";
import { overviewModel } from "./overview.js";
import { renderingModel } from "./rendering.js";
import { requestsModel } from "./requests.js";
import { servicesModel } from "./services.js";
import { tracesModel } from "./traces.js";

export * from "./input.js";
export * from "./request-filter.js";
export * from "./service-detail.js";
export * from "./overview.js";
export * from "./requests.js";
export * from "./database.js";
export * from "./errors.js";
export * from "./logs.js";
export * from "./rendering.js";
export * from "./services.js";
export * from "./insights.js";
export * from "./traces.js";
export * from "./alerts.js";

/** Every page model by name. The cloud serves them at `api/models/<name>`; the browser runs them for in-app and hub. */
export const PAGE_MODELS = {
  overview: overviewModel,
  requests: requestsModel,
  traces: tracesModel,
  database: databaseModel,
  rendering: renderingModel,
  errors: errorsModel,
  logs: logsModel,
  services: servicesModel,
  insights: insightsModel,
} satisfies Record<string, (i: ModelInput) => unknown>;

export type PageName = keyof typeof PAGE_MODELS;
export type ModelOf<P extends PageName> = ReturnType<(typeof PAGE_MODELS)[P]>;
export const isPageName = (v: string): v is PageName => v in PAGE_MODELS;
