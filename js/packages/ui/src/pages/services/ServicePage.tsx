import { ArrowLeft } from "lucide-react";
import type { ServicePageModel, ServiceRow } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { usePageModel } from "../../data/models";
import { hrefTo } from "../../routes";
import { ModelState } from "../../ui/ModelState";
import { Empty, Panel } from "../../ui/Panel";
import { RegistryHosts } from "./RegistryHosts";
import { ServiceInfra } from "./ServiceInfra";
import { LatencyPanel, ServiceCards, TrafficPanel } from "./ServiceCharts";
import { ServiceHeader, useHostGroups } from "./ServiceHeader";
import { ErrorsPanel, LogsPanel, RuntimePanel, SlowestPanel } from "./ServiceOwned";
import { EdgesPanel, EndpointsPanel } from "./ServiceTables";
import { VersionsPanel } from "./ServiceVersions";
import "../../styles/pages/services.css";

/** Kinds whose spans are listed by endpoint, query, or call. */
const WITH_ENDPOINTS = new Set<ServiceRow["kind"]>(["api", "web", "database", "external"]);

function NoService({ id }: { id: string }) {
  return (
    <Panel>
      <a className="wl-back" href={hrefTo("services")}>
        <ArrowLeft size={14} aria-hidden="true" /> All services
      </a>
      <Empty title={`${id} did nothing in this time range`}>Pick a longer time range at the top, or open another service.</Empty>
    </Panel>
  );
}

function ServiceBody({ m, row }: { m: ServicePageModel; row: ServiceRow }) {
  const { updatedMs } = useData();
  const groups = useHostGroups(row.name, m.owned);
  return (
    <>
      <ServiceHeader row={row} groups={groups} />
      <ServiceCards m={m} row={row} />
      <div className="wl-grid wl-grid-2-even">
        <TrafficPanel m={m} row={row} />
        <LatencyPanel m={m} />
      </div>
      {WITH_ENDPOINTS.has(row.kind) && <EndpointsPanel m={m} row={row} />}
      {m.owned && (
        <div className="wl-grid wl-grid-2-even">
          <ErrorsPanel m={m} name={row.name} />
          <SlowestPanel m={m} name={row.name} />
        </div>
      )}
      <div className="wl-grid wl-grid-2-even">
        <EdgesPanel title="Called By" edges={m.incoming} side="from" empty="Nothing called this service in this range." />
        <EdgesPanel title="Calls" edges={m.outgoing} side="to" empty="This service called nothing in this range." />
      </div>
      {m.owned && <VersionsPanel m={m} name={row.name} />}
      {m.owned && <LogsPanel m={m} name={row.name} />}
      {m.owned && <RuntimePanel name={row.name} />}
      {m.owned && <ServiceInfra name={row.name} />}
      {groups.map((g) => (
        <RegistryHosts key={g.key} group={g} now={updatedMs} />
      ))}
    </>
  );
}

/** One service on its own page: health, traffic, latency, endpoints, callers, and for your own services its errors, requests, logs, runtime, and hosts. */
export function ServicePage({ id }: { id: string }) {
  const { model, loading, error } = usePageModel("service", { service: id });
  return (
    <div className="wl-svc-page">
      <ModelState model={model} loading={loading} error={error} what="this service" />
      {model && (model.row ? <ServiceBody m={model} row={model.row} /> : <NoService id={id} />)}
    </div>
  );
}
