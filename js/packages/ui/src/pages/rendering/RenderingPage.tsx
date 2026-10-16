import { Gauge, Server, TriangleAlert, Zap } from "lucide-react";
import { fmtCount, fmtMs } from "../../format";
import { useRoute } from "../../routes";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { PhasePanel, RouteChartPanel } from "./RenderCharts";
import { ComponentTable, RouteTable } from "./RenderTables";
import { type RenderingData, useRendering } from "./useRendering";
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

function Cards({ data }: { data: RenderingData }) {
  const { cards, compareLabel } = data;
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Gauge} label="Avg. Render Time" value={fmtMs(cards.render.value)} change={cards.render.change} upIsGood={false} compareLabel={compareLabel} series={cards.render.series} />
      <StatCard icon={Server} label="SSR Time" value={fmtMs(cards.ssr.value)} change={cards.ssr.change} upIsGood={false} compareLabel={compareLabel} series={cards.ssr.series} />
      <StatCard icon={Zap} label="Hydration Time" value={fmtMs(cards.hydration.value)} change={cards.hydration.change} upIsGood={false} compareLabel={compareLabel} series={cards.hydration.series} />
      <StatCard icon={TriangleAlert} danger label="Component Issues" value={fmtCount(cards.issues.value)} change={cards.issues.change} upIsGood={false} compareLabel={compareLabel} series={cards.issues.series} />
    </div>
  );
}

export function RenderingPage() {
  const data = useRendering();
  const all = useRoute().query.get("all");
  const empty = data.views.length === 0 && !data.hasReact;
  return (
    <>
      <PageHeader title="Rendering" subtitle="Frontend rendering diagnostics across server-side rendering, hydration, and component cost." />
      {empty ? (
        <Setup loading={data.loading} />
      ) : (
        <>
          <Cards data={data} />
          <div className="wl-grid wl-grid-2">
            <RouteChartPanel views={data.views} starts={data.starts} window={data.window} />
            <PhasePanel views={data.views} />
          </div>
          <div className="wl-grid">
            <RouteTable routes={data.routes} all={all === "routes"} />
            <ComponentTable components={data.components} hasReact={data.hasReact} all={all === "components"} />
          </div>
        </>
      )}
    </>
  );
}
