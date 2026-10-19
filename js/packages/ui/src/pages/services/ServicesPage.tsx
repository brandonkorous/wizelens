import { Box, Database, Gauge, TriangleAlert } from "lucide-react";
import { percentChange, type ServicesModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { useRoute } from "../../routes";
import { fmtCount, fmtPct } from "../../format";
import { ModelState } from "../../ui/ModelState";
import { PageHeader, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { DependencyMap } from "./DependencyMap";
import { RegistryPanel } from "./RegistryPanel";
import { ServiceDetail } from "./ServiceDetail";
import { EndpointPage } from "./EndpointPage";
import { ServicePage } from "./ServicePage";
import { serviceIdOf, ServiceTable } from "./serviceParts";
import "../../styles/pages/services.css";

function Cards({ m }: { m: ServicesModel }) {
  const { summary: cur, prevSummary: prev } = m;
  const compareLabel = m.meta.compareLabel;
  const change = (a: number | null, b: number | null) => (m.meta.hasPrev ? percentChange(a, b) : null);
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Box} label="Services" value={fmtCount(cur.apis)} change={change(cur.apis, prev.apis)} upIsGood compareLabel={compareLabel} />
      <StatCard icon={Database} label="Databases" value={fmtCount(cur.databases)} change={change(cur.databases, prev.databases)} upIsGood compareLabel={compareLabel} />
      <StatCard icon={Gauge} label="Requests Served" value={fmtCount(cur.served)} change={change(cur.served, prev.served)} upIsGood compareLabel={compareLabel} series={m.served} />
      <StatCard icon={TriangleAlert} label="Error Rate" value={fmtPct(cur.errorRate)} change={change(cur.errorRate, prev.errorRate)} upIsGood={false} compareLabel={compareLabel} series={m.failed} danger />
    </div>
  );
}

function ServicesBody({ m }: { m: ServicesModel }) {
  const selected = m.selected;
  return (
    <>
      <Cards m={m} />
      <div className={`wl-grid${selected ? " wl-grid-side" : ""}`}>
        <Panel title={`Services (${m.rows.length})`} flush>
          <ServiceTable rows={m.rows} selectedKey={selected?.row.key ?? null} />
        </Panel>
        {selected && <ServiceDetail detail={selected} />}
      </div>
      <RegistryPanel />
      <Panel title="Dependencies">
        <DependencyMap rows={m.rows} edges={m.edges} selectedKey={selected?.row.key ?? null} />
      </Panel>
    </>
  );
}

function AllServices() {
  const { model, loading, error } = usePageModel("services");
  return (
    <>
      <PageHeader title="Services" subtitle="Every service and database in your stack, how healthy it is, and what it talks to." />
      <ModelState model={model} loading={loading} error={error} what="services" />
      {model && <ServicesBody m={model} />}
    </>
  );
}

/** All services, one service's page at `#/services/<key or name>`, or one endpoint's at `.../endpoints/<endpoint>`. */
export function ServicesPage() {
  const [id, part, endpoint] = useRoute().params;
  if (id && part === "endpoints" && endpoint) return <EndpointPage key={`${id}/${endpoint}`} service={serviceIdOf(id)} endpoint={serviceIdOf(endpoint)} />;
  return id ? <ServicePage key={id} id={serviceIdOf(id)} /> : <AllServices />;
}
