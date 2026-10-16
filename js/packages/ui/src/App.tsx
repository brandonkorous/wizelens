import { type ComponentType, useEffect, useMemo } from "react";
import { type Health, isFailed, requestRows } from "@wizeworks/lens-core";
import { TraceDetail } from "./pages/trace/TraceDetailPage";
import { useData, useWindowed } from "./data/hooks";
import { applyTheme, useTheme } from "./data/prefs";
import { DatabasePage } from "./pages/database/DatabasePage";
import { ErrorsPage } from "./pages/errors/ErrorsPage";
import { InsightsPage } from "./pages/insights/InsightsPage";
import { LogsPage } from "./pages/logs/LogsPage";
import { OverviewPage } from "./pages/overview/OverviewPage";
import { RenderingPage } from "./pages/rendering/RenderingPage";
import { RequestsPage } from "./pages/requests/RequestsPage";
import { ServicesPage } from "./pages/services/ServicesPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { TracesPage } from "./pages/traces/TracesPage";
import { type PageId, type Route, useRoute } from "./routes";
import { Sidebar } from "./shell/Sidebar";
import { TopBar } from "./shell/TopBar";

const PAGES: Record<Exclude<PageId, "trace">, ComponentType> = {
  overview: OverviewPage,
  requests: RequestsPage,
  traces: TracesPage,
  database: DatabasePage,
  rendering: RenderingPage,
  errors: ErrorsPage,
  logs: LogsPage,
  services: ServicesPage,
  insights: InsightsPage,
  settings: SettingsPage,
};

const RECENT_MS = 5 * 60_000;
const DOT: Partial<Record<Health, string>> = { critical: "var(--wl-red)", warning: "var(--wl-orange)" };

/** Logo dot: red after a recent failure, orange after a recent slow request, else brand blue. */
function useHealthDot(): string | undefined {
  const data = useData();
  return useMemo(() => {
    const recent = requestRows(data.traces.filter((t) => t.startMs >= data.updatedMs - RECENT_MS));
    if (recent.some(isFailed)) return DOT.critical;
    return recent.some((r) => r.health === "warning") ? DOT.warning : undefined;
  }, [data.traces, data.updatedMs]);
}

function PageView({ route }: { route: Route }) {
  if (route.page === "trace") {
    const [traceId, view] = route.params;
    return <TraceDetail key={traceId} traceId={traceId!} view={view as never} />;
  }
  const Page = PAGES[route.page];
  return <Page />;
}

export function App() {
  const route = useRoute();
  const data = useData();
  const win = useWindowed();
  const [theme] = useTheme();
  const dot = useHealthDot();
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    document.title = data.info ? `WizeLens · ${data.info.service}` : "WizeLens";
  }, [data.info]);
  const errors = win.requests.filter(isFailed).length;
  return (
    <div className="wl-shell">
      <Sidebar page={route.page} counts={{ errors }} dot={dot} />
      <div className="wl-main">
        <TopBar data={data} />
        <main className="wl-page">
          <PageView route={route} />
        </main>
      </div>
    </div>
  );
}
