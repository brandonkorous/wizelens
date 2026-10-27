import { RotateCcw } from "lucide-react";
import { type DatabaseModel, OPERATIONS } from "@wizeworks/lens-core";
import { setQuery } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { ServiceSelect } from "../../ui/ServiceSelect";
import { useSearchText } from "../../ui/useSearchText";

const SORTS: [string, string][] = [["avg", "Slowest"], ["count", "Most frequent"], ["total", "Most total time"], ["slow", "Most slow runs"]];

const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [current, ...list] : list);
const pairs = (list: string[]): [string, string][] => list.map((v) => [v, v]);

/** Service, database, operation, table, text, and order of the query list. */
export function DbFilters({ stats }: { stats: DatabaseModel }) {
  const f = stats.filter;
  const [text, setText] = useSearchText(f.q);
  const set = (key: string) => (value: string) => setQuery({ [key]: value || null, page: null, tblpage: null });
  const tables = withCurrent(stats.tables.map((t) => t.table), f.table);
  const reset = () => setQuery({ q: null, table: null, operation: null, database: null, sort: null, page: null, tblpage: null });
  return (
    <section className="wl-panel wl-filters">
      <ServiceSelect value={f.service} />
      <Select label="Database" value={f.database} onChange={set("database")} options={[["", "All Databases"], ...pairs(withCurrent(stats.databases, f.database))]} />
      <Select label="Operation" value={f.operation} onChange={set("operation")} options={[["", "All Operations"], ...pairs([...OPERATIONS])]} />
      <Select label="Table" value={f.table} onChange={set("table")} options={[["", "All Tables"], ...pairs(tables)]} />
      <Select label="Order" value={f.sort} onChange={set("sort")} options={SORTS} />
      <SearchInput value={text} onChange={setText} placeholder="Search queries…" />
      <button type="button" className="wl-btn" onClick={reset}>
        <RotateCcw aria-hidden="true" /> Reset
      </button>
    </section>
  );
}
