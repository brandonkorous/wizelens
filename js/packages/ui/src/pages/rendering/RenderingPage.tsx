import { Gauge, Server, TriangleAlert, Zap } from "lucide-react";
import { fmtCount, fmtMs } from "../../format";
import { decodeParam, useRoute } from "../../routes";
import { RoutePage } from "./RoutePage";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { SearchInput } from "../../ui/Controls";
import { StatCard } from "../../ui/StatCard";
import { useSearchText } from "../../ui/useSearchText";
import { PhasePanel, RouteChartPanel } from "./RenderCharts";
import { ComponentTable, RouteTable } from "./RenderTables";
import type { RenderingModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { ModelState } from "../../ui/ModelState";
import "../../styles/pages/rendering.css";

const SETUP = `// main.tsx: first line, before React loads
import "@wizeworks/lens-react/install";

// Wrap your app once
<WizeLensProvider endpoint="/_wizelens">
  <App />
</WizeLensProvider>`;

function Setup({ loading }: { loading: boolean }) {
  return (
    <Panel>
      <Empty title={loading ? "Loading page views…" : "No page views in this range"}>
        {!loading && (
          <div className="wl-render-setup">
            <p>Page views, render phases, and component timings come from the browser. Add the WizeLens React package to your app:</p>
            <pre className="wl-code">{SETUP}</pre>
            <p className="wl-small">Then load a few pages. Component timings need a React development build.</p>
          </div>
        )}
      </Empty>
    </Panel>
  );
}

function Cards({ data }: { data: RenderingModel }) {
  const { cards } = data;
  const { compareLabel } = data.meta;
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Gauge} label="Avg. Render Time" value={fmtMs(cards.render.value)} change={cards.render.change} upIsGood={false} compareLabel={compareLabel} series={cards.render.series} />
      <StatCard icon={Server} label="SSR Time" value={fmtMs(cards.ssr.value)} change={cards.ssr.change} upIsGood={false} compareLabel={compareLabel} series={cards.ssr.series} />
      <StatCard icon={Zap} label="Hydration Time" value={fmtMs(cards.hydration.value)} change={cards.hydration.change} upIsGood={false} compareLabel={compareLabel} series={cards.hydration.series} />
      <StatCard icon={TriangleAlert} danger label="Component Issues" value={fmtCount(cards.issues.value)} change={cards.issues.change} upIsGood={false} compareLabel={compareLabel} series={cards.issues.series} />
    </div>
  );
}

/** Text that narrows the route and component tables. */
function RenderSearch() {
  const [text, setText] = useSearchText(useRoute().query.get("q") ?? "", {});
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
  const all = useRoute().query.get("all");
  const empty = !data || (data.views === 0 && !data.hasReact);
  return (
    <>
      <PageHeader title="Rendering" subtitle="Frontend rendering diagnostics across server-side rendering, hydration, and component cost." />
      <ModelState model={data} loading={false} error={error} what="page views" />
      {empty ? (
        <Setup loading={loading} />
      ) : (
        <>
          <Cards data={data} />
          <div className="wl-grid wl-grid-2">
            <RouteChartPanel m={data} />
            <PhasePanel m={data} />
          </div>
          <RenderSearch />
          <div className="wl-grid">
            <RouteTable routes={data.routes} total={data.routeCount} all={all === "routes"} />
            <ComponentTable components={data.components} total={data.componentCount} hasReact={data.hasReact} all={all === "components"} />
          </div>
        </>
      )}
    </>
  );
}
