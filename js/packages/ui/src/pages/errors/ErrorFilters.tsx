import { RotateCcw } from "lucide-react";
import type { ErrorsModel } from "@wizeworks/lens-core";
import { setQuery } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { Check } from "../../ui/Field";
import { ServiceSelect } from "../../ui/ServiceSelect";
import { useSearchText } from "../../ui/useSearchText";

const SORTS: [string, string][] = [["recent", "Most recent"], ["count", "Most frequent"]];

/** The current value first when the options miss it, so a linked filter still shows. */
const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [current, ...list] : list);

const pathOf = (endpoint: string) => endpoint.replace(/^[A-Z]+ /, "");

/** Service, type, endpoint, critical, text, and order of the exception list. */
export function ErrorFilters({ stats }: { stats: ErrorsModel }) {
  const f = stats.filter;
  const [text, setText] = useSearchText(f.q, { page: null, group: null });
  const set = (key: string) => (value: string) => setQuery({ [key]: value || null, page: null, group: null });
  const types = withCurrent(stats.types.map((t) => t.type), f.type);
  const endpoints = withCurrent(stats.endpoints.map((e) => e.endpoint), f.endpoint);
  const reset = () => setQuery({ type: null, endpoint: null, critical: null, q: null, sort: null, page: null, group: null });
  return (
    <section className="wl-panel wl-filters">
      <ServiceSelect value={f.service} services={stats.services.map((s) => s.service)} />
      <Select label="Error type" value={f.type} onChange={set("type")} options={[["", "All Types"], ...types.map((t): [string, string] => [t, t])]} />
      <Select label="Endpoint" value={f.endpoint} onChange={set("endpoint")} options={[["", "All Endpoints"], ...endpoints.map((e): [string, string] => [e, pathOf(e)])]} />
      <Select label="Order" value={f.sort} onChange={set("sort")} options={SORTS} />
      <SearchInput value={text} onChange={setText} placeholder="Search errors by type or message…" />
      <Check label="Critical only" checked={f.critical} onChange={(e) => setQuery({ critical: e.target.checked ? "1" : null, page: null, group: null })} />
      <button type="button" className="wl-btn" onClick={reset}>
        <RotateCcw aria-hidden="true" /> Reset
      </button>
    </section>
  );
}
