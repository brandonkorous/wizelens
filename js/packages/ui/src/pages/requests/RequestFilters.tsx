import { FilterPanel } from "../../ui/FilterPanel";
import { setQuery } from "../../routes";
import { Select } from "../../ui/Controls";
import { ListQueryBar } from "../../ui/ListQueryBar";
import { Check } from "../../ui/Field";
import { FilterChips } from "../../ui/FilterChips";
import { ServiceSelect } from "../../ui/ServiceSelect";
import { DURATION_OPTIONS, FILTER_KEYS, type RequestFilter, STATUS_OPTIONS } from "@wizeworks/lens-core/internal";

export interface RequestFiltersProps {
  filter: RequestFilter;
  methods: string[];
  services: string[];
}

/** Method, status, duration, and service selects, a search box, and Reset. */
export function RequestFilters({ filter, methods, services }: RequestFiltersProps) {
  const set = (key: keyof RequestFilter) => (value: string) => setQuery({ [key]: value, page: null });
  const reset = () => setQuery({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), page: null });
  const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [...list, current] : list);
  return (
    <FilterPanel active={[filter.method, filter.status, filter.duration, filter.service, filter.insights === "1"]}>
      <Select label="Method" value={filter.method} onChange={set("method")} options={[["", "All Methods"], ...withCurrent(methods, filter.method).map((m): [string, string] => [m, m])]} />
      <Select label="Status" value={filter.status} onChange={set("status")} options={STATUS_OPTIONS} />
      <Select label="Duration" value={filter.duration} onChange={set("duration")} options={DURATION_OPTIONS} />
      <ServiceSelect value={filter.service} services={services} />
      <ListQueryBar value={filter.q} reset={{ trace: null }} placeholder="Path, user, or trace ID; or status:5xx duration:>1s @user.id:42" />
      <Check label="With insights" checked={filter.insights === "1"} onChange={(e) => setQuery({ insights: e.target.checked ? "1" : null, page: null })} />
      <button type="button" className="wl-btn" onClick={reset}>
        Reset
      </button>
      <FilterChips chips={[["Endpoint", "endpoint", filter.endpoint], ["User", "user", filter.user]]} />
    </FilterPanel>
  );
}
