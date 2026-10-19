import { type ComponentType, lazy, Suspense, useEffect, useMemo } from "react";
import { errorEvents, type Health, isFailed, requestRows } from "@wizeworks/lens-core";
import { TraceDetail } from "./pages/trace/TraceDetailPage";
import { TraceCompare } from "./pages/trace/TraceCompare";
import { AlertsPage } from "./pages/alerts/AlertsPage";
import { SlosPage } from "./pages/slos/SlosPage";
import { DashboardsPage } from "./pages/dashboards/DashboardsPage";
import { UsersPage } from "./pages/users/UsersPage";
import { AuthGate } from "./shell/auth/AuthGate";
import { useData, useWindowed } from "./data/hooks";
import { useHost } from "./data/host";
import { useServerErrorCount } from "./data/models";
import { applyTheme, useTheme } from "./data/prefs";
import { useViewInUrl } from "./data/urlState";
import { useClockPref, useTimeZonePref } from "./data/period";
import { setTimeFormat } from "./format";
import { DatabasePage } from "./pages/database/DatabasePage";
import { ErrorsPage } from "./pages/errors/ErrorsPage";
import { InsightsPage } from "./pages/insights/InsightsPage";
import { LogsPage } from "./pages/logs/LogsPage";
import { MetricsPage } from "./pages/metrics/MetricsPage";
import { HostsPage } from "./pages/infra/HostsPage";
import { KubernetesPage } from "./pages/infra/KubernetesPage";
import { OverviewPage } from "./pages/overview/OverviewPage";
import { ProblemsPage } from "./pages/problems/ProblemsPage";
import { RenderingPage } from "./pages/rendering/RenderingPage";
import { RequestsPage } from "./pages/requests/RequestsPage";
import { SearchPage } from "./pages/search/SearchPage";
import { ServicesPage } from "./pages/services/ServicesPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { TracesPage } from "./pages/traces/TracesPage";
import { UptimePage } from "./pages/uptime/UptimePage";
import { AUTH_PAGES, type AuthPageId, type PageId, type Route, useRoute } from "./routes";
import { releaseMissing } from "./data/release";
import { EmailBanner } from "./shell/EmailBanner";
import { UsageBanner } from "./shell/UsageBanner";
import { Sidebar } from "./shell/Sidebar";
import { TopBar } from "./shell/TopBar";
import { UpdateBanner, UpdateNeeded } from "./shell/UpdateBanner";

/** A page loaded on first visit. If its file is gone (a new release), the page asks for a refresh instead of breaking. */
const lazyPage = (load: () => Promise<ComponentType>) =>
  lazy(() => load().then((Page) => ({ default: Page }), () => (releaseMissing(), { default: UpdateNeeded })));

// Cloud-only pages load on first visit, so in-app and hub dashboards never download them.
const TeamPage = lazyPage(() => import("./pages/team/TeamPage").then((m) => m.TeamPage));
const AccountPage = lazyPage(() => import("./pages/account/AccountPage").then((m) => m.AccountPage));

const PAGES: Record<Exclude<PageId, "trace" | "shared" | "status" | AuthPageId>, ComponentType> = {
  overview: OverviewPage,
  problems: ProblemsPage,
  search: SearchPage,
  requests: RequestsPage,
  traces: TracesPage,
  database: DatabasePage,
  rendering: RenderingPage,
  errors: ErrorsPage,
  logs: LogsPage,
  metrics: MetricsPage,
  hosts: HostsPage,
  kubernetes: KubernetesPage,
  services: ServicesPage,
  insights: InsightsPage,
  settings: SettingsPage,
  alerts: AlertsPage,
  uptime: UptimePage,
  slos: SlosPage,
  dashboards: DashboardsPage,
  users: UsersPage,
  team: TeamPage,
  account: AccountPage,
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
  const cloud = useHost().has("accounts");
  if (route.page === "trace") {
    const [traceId, view, other] = route.params;
    if (view === "compare" && other) return <TraceCompare key={`${traceId}/${other}`} a={traceId!} b={other} />;
    return <TraceDetail key={traceId} traceId={traceId!} view={view as never} />;
  }
  const page = route.page;
  const elsewhere = page === "shared" || page === "status" || (AUTH_PAGES as readonly string[]).includes(page) || (page === "account" && !cloud);
  const Page = elsewhere ? OverviewPage : PAGES[page as keyof typeof PAGES];
  return <Page />;
}

export function App() {
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}

function Shell() {
  const route = useRoute();
  const data = useData();
  const win = useWindowed();
  const [theme] = useTheme();
  const dot = useHealthDot();
  useEffect(() => applyTheme(theme), [theme]);
  const [zone] = useTimeZonePref();
  const [clock] = useClockPref();
  // Set before children render, so every time on the page uses the choice.
  setTimeFormat({ utc: zone === "utc", hour12: clock === "12" });
  // Range, period, and scope live in the address bar too, so links (alert notices, shared views) open the same view.
  useViewInUrl();
  // A new page (or a new section of one) starts at the top, not where the last page was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page, route.params.join("/")]);
  useEffect(() => {
    document.title = data.info ? `WizeLens · ${data.info.service}` : "WizeLens";
  }, [data.info]);
  // The same number as "Total Exceptions" on the Errors page: from the host when it computes stats, else from the loaded traces.
  const serverErrors = useServerErrorCount();
  const localErrors = useMemo(() => (serverErrors === null ? errorEvents(win.traces).length : 0), [serverErrors, win.traces]);
  const errors = serverErrors ?? localErrors;
  return (
    <div className="wl-shell">
      <Sidebar page={route.page} counts={{ errors }} dot={dot} />
      <div className="wl-main">
        <TopBar data={data} />
        <UpdateBanner />
        <EmailBanner />
        <UsageBanner />
        <main className="wl-page">
          <PageView route={route} />
        </main>
      </div>
    </div>
  );
}
