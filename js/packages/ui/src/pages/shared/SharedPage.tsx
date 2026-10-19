import type { ReactNode } from "react";
import { SharedModelContext } from "../../data/sharedModel";
import { AllQueries } from "../database/DatabasePage";
import { QueryPage } from "../database/QueryPage";
import { ErrorGroupPage } from "../errors/ErrorGroupPage";
import { AllErrors } from "../errors/ErrorsPage";
import { InsightsPage } from "../insights/InsightsPage";
import { LogsPage } from "../logs/LogsPage";
import { OverviewPage } from "../overview/OverviewPage";
import { AllRendering } from "../rendering/RenderingPage";
import { RoutePage } from "../rendering/RoutePage";
import { RequestsPage } from "../requests/RequestsPage";
import { EndpointPage } from "../services/EndpointPage";
import { ServicePage } from "../services/ServicePage";
import { AllServices } from "../services/ServicesPage";
import { TracesPage } from "../traces/TracesPage";

type Params = Record<string, string>;

/** Each page a link can share, drawn from its kept model; detail pages take their names from the kept parameters. */
const VIEWS: Record<string, (p: Params) => ReactNode> = {
  overview: () => <OverviewPage />,
  requests: () => <RequestsPage />,
  errors: () => <AllErrors />,
  error: (p) => <ErrorGroupPage group={p.group ?? ""} />,
  database: () => <AllQueries />,
  query: (p) => <QueryPage query={p.q ?? ""} />,
  logs: () => <LogsPage />,
  insights: () => <InsightsPage />,
  rendering: () => <AllRendering />,
  route: (p) => <RoutePage route={p.route ?? ""} />,
  services: () => <AllServices />,
  service: (p) => <ServicePage id={p.service ?? ""} />,
  endpoint: (p) => <EndpointPage service={p.service ?? ""} endpoint={p.endpoint ?? ""} />,
  traces: () => <TracesPage />,
};

/** A page someone shared: its numbers as they were when the link was made. */
export function SharedPage({ page, params, model }: { page: string; params: Params; model: unknown }) {
  const view = VIEWS[page];
  return <SharedModelContext.Provider value={{ page, model }}>{view ? view(params) : null}</SharedModelContext.Provider>;
}

export const isSharedPage = (page: string): boolean => page in VIEWS;
