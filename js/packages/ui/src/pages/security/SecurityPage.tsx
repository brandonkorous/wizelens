import { Globe, ShieldAlert, TriangleAlert } from "lucide-react";
import { OWASP_CATEGORIES, percentChange, type SecurityModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { useServiceScope } from "../../data/prefs";
import { fmtAgo, fmtCount } from "../../format";
import { setQuery, useRoute } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { ExportButton } from "../../ui/ExportButton";
import { FilterChips } from "../../ui/FilterChips";
import { ModelState } from "../../ui/ModelState";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { ServiceSelect } from "../../ui/ServiceSelect";
import { StatCard } from "../../ui/StatCard";
import { useSearchText } from "../../ui/useSearchText";
import { OwaspGrid } from "./OwaspGrid";
import { SecurityDetail } from "./SecurityDetail";
import { SecurityList } from "./SecurityList";
import "../../styles/pages/insights.css";
import "../../styles/pages/security.css";

function Cards({ m }: { m: SecurityModel }) {
  const { totals: cur, prevTotals: prev } = m;
  const compareLabel = m.meta.compareLabel;
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={ShieldAlert} label="Security Risks" value={fmtCount(m.found.value)} change={m.found.change} upIsGood={false} compareLabel={compareLabel} series={m.found.series} />
      <StatCard icon={TriangleAlert} danger label="High Severity" value={fmtCount(cur.high)} change={percentChange(cur.high, prev.high)} upIsGood={false} compareLabel={compareLabel} />
      <StatCard icon={Globe} label="Endpoints Affected" value={fmtCount(cur.endpoints)} change={percentChange(cur.endpoints, prev.endpoints)} upIsGood={false} compareLabel={compareLabel} />
    </div>
  );
}

const STATUSES: [string, string][] = [["unresolved", "Open"], ["resolved", "Fixed"], ["ignored", "Dismissed"], ["all", "All Statuses"]];
const SEVERITIES: [string, string][] = [["all", "All Severities"], ["error", "High"], ["warning", "Medium"], ["info", "Low"]];
const CATEGORIES: [string, string][] = [["all", "All Categories"], ...OWASP_CATEGORIES.map((c): [string, string] => [c.id, `${c.id} ${c.name}`])];

/** Service, status, release, category, severity, and search live in the URL, so a filtered view can be shared. */
function Filters({ issues, releases }: { issues: boolean; releases: string[] }) {
  const q = useRoute().query;
  const [scope] = useServiceScope();
  const [text, setText] = useSearchText(q.get("q") ?? "", {});
  return (
    <Panel className="wl-filters">
      <ServiceSelect value={q.get("service") ?? scope} />
      {issues && <Select label="Status" value={q.get("status") ?? "unresolved"} onChange={(v) => setQuery({ status: v === "unresolved" ? null : v, key: null })} options={STATUSES} />}
      {releases.length > 0 && <Select label="Release" value={q.get("release") ?? ""} onChange={(v) => setQuery({ release: v || null, key: null })} options={[["", "Any Release"], ...releases.map((v): [string, string] => [v, `New in ${v}`])]} />}
      <Select label="Category" value={q.get("category") ?? "all"} onChange={(v) => setQuery({ category: v === "all" ? null : v, key: null })} options={CATEGORIES} />
      <Select label="Severity" value={q.get("severity") ?? "all"} onChange={(v) => setQuery({ severity: v === "all" ? null : v })} options={SEVERITIES} />
      <SearchInput value={text} onChange={setText} placeholder="Search by risk, query, header, or endpoint…" />
      <FilterChips chips={[["Endpoint", "endpoint", q.get("endpoint") ?? ""]]} />
    </Panel>
  );
}

/** The package check line under the OWASP grid; null when the host does not check packages. */
function scanNote({ scan }: SecurityModel, now: number): string | null {
  if (!scan) return null;
  if (!scan.packages) return "No service has reported its packages yet. WizeLens SDKs send them at start.";
  return `${fmtCount(scan.packages)} package versions from ${fmtCount(scan.services)} services are checked against OSV${scan.checkedMs ? `, last ${fmtAgo(scan.checkedMs, now)}` : ""}.`;
}

function SecurityBody({ m, wanted }: { m: SecurityModel; wanted: string | null }) {
  const now = m.meta.window.to;
  const category = useRoute().query.get("category");
  return (
    <>
      <Cards m={m} />
      <OwaspGrid categories={m.categories} selected={category} note={scanNote(m, now)} />
      <Filters issues={m.hasIssues} releases={m.releases.map((r) => r.version)} />
      <div className={`wl-grid${wanted ? " wl-grid-side" : ""}`}>
        <Panel flush title={`Risks (${fmtCount(m.matching)})`} action={<ExportButton page="security" disabled={m.matching === 0} />}>
          <SecurityList groups={m.groups} issues={m.issues} selected={m.selected?.key ?? null} now={now} filtered={m.matching !== m.totals.count} />
        </Panel>
        {wanted && (m.selected ? <SecurityDetail group={m.selected} info={m.issues[m.selected.key]} users={m.selectedUsers} now={now} /> : <Panel><Empty title="This risk is not in the selected time range" /></Panel>)}
      </div>
    </>
  );
}

export function SecurityPage() {
  const key = useRoute().query.get("key");
  const { model, loading, error } = usePageModel("security");
  return (
    <>
      <PageHeader title="Security" subtitle="OWASP Top 10 risks WizeLens found in your real traffic, ranked by severity." />
      <ModelState model={model} loading={loading} error={error} what="security risks" />
      {model && <SecurityBody m={model} wanted={key} />}
    </>
  );
}
