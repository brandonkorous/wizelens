import { Gauge, Server, TriangleAlert, Zap } from "lucide-react";
import { fmtCount, fmtMs } from "../../format";
import { decodeParam, useRoute } from "../../routes";
import { RoutePage } from "./RoutePage";
import { PageHeader } from "../../ui/Panel";
import { RenderSetup } from "./RenderSetup";
import { SearchInput } from "../../ui/Controls";
import { StatCard } from "../../ui/StatCard";
import { useSearchText } from "../../ui/useSearchText";
import { PhasePanel, RouteChartPanel } from "./RenderCharts";
import { ComponentTable, RouteTable } from "./RenderTables";
import { DeviceTable } from "./DeviceTable";
import type { RenderingModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { ModelState } from "../../ui/ModelState";
import "../../styles/pages/rendering.css";

function Cards({ data }: { data: RenderingModel }) {
  const { cards } = data;
  const { compareLabel } = data.meta;
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Gauge} label="Avg. Render Time" value={fmtMs(cards.render.value)} change={cards.render.change} upIsGood={false} compareLabel={compareLabel} series={cards.render.series} />
      <StatCard icon={Server} label="Server Response" value={fmtMs(cards.ssr.value)} change={cards.ssr.change} upIsGood={false} compareLabel={compareLabel} series={cards.ssr.series} />
      <StatCard icon={Zap} label="Hydration Time" value={fmtMs(cards.hydration.value)} change={cards.hydration.change} upIsGood={false} compareLabel={compareLabel} series={cards.hydration.series} note={cards.hydration.value === null ? "None: no UI framework seen" : undefined} />
      <StatCard icon={TriangleAlert} danger label="Component Issues" value={fmtCount(cards.issues.value)} change={cards.issues.change} upIsGood={false} compareLabel={compareLabel} series={cards.issues.series} />
    </div>
  );
}

/** Text that narrows the route and component tables. */
function RenderSearch() {
  const [text, setText] = useSearchText(useRoute().query.get("q") ?? "", { rtpage: null, cmppage: null });
  return (
    <section className="wl-panel wl-filters">
      <SearchInput value={text} onChange={setText} placeholder="Search routes and components…" />
    </section>
  );
}

/** All routes and components, or one route's page at `#/rendering/routes/<route>`. */
export function RenderingPage() {
  const [part, route] = useRoute().params;
  return part === "routes" && route ? <RoutePage key={route} route={decodeParam(route)} /> : <AllRendering />;
}

export function AllRendering() {
  const { model: data, loading, error } = usePageModel("rendering");
  const empty = !data || (data.views === 0 && !data.hasReact);
  return (
    <>
      <PageHeader title="Rendering" subtitle="Frontend rendering diagnostics across server-side rendering, hydration, and component cost." />
      <ModelState model={data} loading={false} error={error} what="page views" />
      {empty ? (
        <RenderSetup loading={loading} />
      ) : (
        <>
          <Cards data={data} />
          <div className="wl-grid wl-grid-2">
            <RouteChartPanel m={data} />
            <PhasePanel m={data} />
          </div>
          <DeviceTable devices={data.devices} total={data.views} />
          <RenderSearch />
          <div className="wl-grid">
            <RouteTable routes={data.routes} paging={data.routePaging} />
            <ComponentTable components={data.components} paging={data.componentPaging} hasReact={data.hasReact} />
          </div>
        </>
      )}
    </>
  );
}
