import { FilterPanel } from "../../ui/FilterPanel";
import { RotateCcw } from "lucide-react";
import { DURATION_OPTIONS, type TraceFilter } from "@wizeworks/lens-core/internal";
import { setQuery } from "../../routes";
import { Select } from "../../ui/Controls";
import { ServiceSelect } from "../../ui/ServiceSelect";

const STATUSES: [string, string][] = [["", "All Statuses"], ["error", "Failed"], ["ok", "Succeeded"]];
const SORTS: [string, string][] = [["time", "Newest first"], ["duration", "Slowest first"]];

/** Service, status, duration, and order of the trace list; the search box sits on the list. */
export function TraceFilters({ filter }: { filter: TraceFilter }) {
  const set = (key: string) => (value: string) => setQuery({ [key]: value || null, page: null });
  const reset = () => setQuery({ status: null, duration: null, sort: null, q: null, page: null });
  return (
    <FilterPanel active={[filter.service, filter.status, filter.duration]}>
      <ServiceSelect value={filter.service} />
      <Select label="Status" value={filter.status} onChange={set("status")} options={STATUSES} />
      <Select label="Duration" value={filter.duration} onChange={set("duration")} options={DURATION_OPTIONS} />
      <Select label="Order" value={filter.sort} onChange={set("sort")} options={SORTS} />
      <button type="button" className="wl-btn" onClick={reset}>
        <RotateCcw aria-hidden="true" /> Reset
      </button>
    </FilterPanel>
  );
}
