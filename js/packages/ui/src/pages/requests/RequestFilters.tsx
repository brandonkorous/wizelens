import { useEffect, useState } from "react";
import { setQuery } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { DURATION_OPTIONS, FILTER_KEYS, type RequestFilter, STATUS_OPTIONS } from "./filters";

export interface RequestFiltersProps {
  filter: RequestFilter;
  methods: string[];
  services: string[];
}

const SEARCH_DELAY_MS = 250;

/** Search text is written to the URL after a short pause, so typing stays smooth. */
function useSearchText(q: string): [string, (v: string) => void] {
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text === q) return;
    const id = setTimeout(() => setQuery({ q: text, trace: null }), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [text, q]);
  return [text, setText];
}

/** Method, status, duration, and service selects, a search box, and Reset. */
export function RequestFilters({ filter, methods, services }: RequestFiltersProps) {
  const [text, setText] = useSearchText(filter.q);
  const set = (key: keyof RequestFilter) => (value: string) => setQuery({ [key]: value });
  const reset = () => setQuery(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
  const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [...list, current] : list);
  return (
    <section className="wl-panel wl-filters">
      <Select label="Method" value={filter.method} onChange={set("method")} options={[["", "All Methods"], ...withCurrent(methods, filter.method).map((m): [string, string] => [m, m])]} />
      <Select label="Status" value={filter.status} onChange={set("status")} options={STATUS_OPTIONS} />
      <Select label="Duration" value={filter.duration} onChange={set("duration")} options={DURATION_OPTIONS} />
      <Select label="Service" value={filter.service} onChange={set("service")} options={[["", "All Services"], ...withCurrent(services, filter.service).map((s): [string, string] => [s, s])]} />
      <SearchInput value={text} onChange={setText} placeholder="Search by path, user, or trace ID…" />
      <button type="button" className="wl-btn" onClick={reset}>
        Reset
      </button>
    </section>
  );
}
