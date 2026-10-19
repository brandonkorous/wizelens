import { RotateCcw } from "lucide-react";
import type { ErrorsModel } from "@wizeworks/lens-core";
import { setQuery } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { Check } from "../../ui/Field";
import { ServiceSelect } from "../../ui/ServiceSelect";
import { useSearchText } from "../../ui/useSearchText";

const SORTS: [string, string][] = [["recent", "Most recent"], ["count", "Most frequent"]];
const STATUSES: [string, string][] = [["unresolved", "Unresolved"], ["resolved", "Resolved"], ["ignored", "Ignored"], ["all", "All Statuses"]];

/** The current value first when the options miss it, so a linked filter still shows. */
const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [current, ...list] : list);

const pathOf = (endpoint: string) => endpoint.replace(/^[A-Z]+ /, "");

/** Service, status, release, type, endpoint, critical, new, text, and order of the exception list. */
export function ErrorFilters({ stats }: { stats: ErrorsModel }) {
  const f = stats.filter;
  const [text, setText] = useSearchText(f.q, { page: null, group: null });
  const set = (key: string) => (value: string) => setQuery({ [key]: value || null, page: null, group: null });
  const types = withCurrent(stats.types.map((t) => t.type), f.type);
  const endpoints = withCurrent(stats.endpoints.map((e) => e.endpoint), f.endpoint);
  const reset = () => setQuery({ type: null, endpoint: null, critical: null, q: null, sort: null, status: null, new: null, release: null, page: null, group: null });
  const releases = withCurrent(stats.releases.map((r) => r.version), f.release);
  const flag = (key: string) => (e: { target: { checked: boolean } }) => setQuery({ [key]: e.target.checked ? "1" : null, page: null, group: null });
  return (
    <section className="wl-panel wl-filters">
      <ServiceSelect value={f.service} services={stats.services.map((s) => s.service)} />
      {stats.hasIssues && <Select label="Status" value={f.status} onChange={(v) => setQuery({ status: v === "unresolved" ? null : v, page: null, group: null })} options={STATUSES} />}
      {releases.length > 0 && <Select label="Release" value={f.release} onChange={set("release")} options={[["", "Any Release"], ...releases.map((v): [string, string] => [v, `New in ${v}`])]} />}
      <Select label="Error type" value={f.type} onChange={set("type")} options={[["", "All Types"], ...types.map((t): [string, string] => [t, t])]} />
      <Select label="Endpoint" value={f.endpoint} onChange={set("endpoint")} options={[["", "All Endpoints"], ...endpoints.map((e): [string, string] => [e, pathOf(e)])]} />
      <Select label="Order" value={f.sort} onChange={set("sort")} options={SORTS} />
      <SearchInput value={text} onChange={setText} placeholder="Search errors by type or message…" />
      <Check label="Critical only" checked={f.critical} onChange={flag("critical")} />
      <Check label="New only" checked={f.fresh} onChange={flag("new")} />
      <button type="button" className="wl-btn" onClick={reset}>
        <RotateCcw aria-hidden="true" /> Reset
      </button>
    </section>
  );
}
