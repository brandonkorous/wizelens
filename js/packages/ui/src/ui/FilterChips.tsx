import { X } from "lucide-react";
import { setQuery } from "../routes";

/** Filters set by a link (an endpoint, a user, a trace) that have no picker: each shows as a chip that clears it. */
export function FilterChips({ chips }: { chips: [label: string, key: string, value: string][] }) {
  const shown = chips.filter(([, , value]) => value);
  if (shown.length === 0) return null;
  return (
    <div className="wl-filter-chips">
      {shown.map(([label, key, value]) => (
        <button key={key} type="button" className="wl-filter-chip" onClick={() => setQuery({ [key]: null, page: null })} title={`Clear the ${label.toLowerCase()} filter`}>
          <span className="wl-muted">{label}:</span>
          <span className="wl-truncate">{value}</span>
          <X size={13} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
