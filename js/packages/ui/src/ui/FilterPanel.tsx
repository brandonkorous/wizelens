import { type ReactNode, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

/** A page's filters. On a phone only the search box and a "Filters (n)" button show, so the numbers come first. */
export function FilterPanel({ active, children }: { active: readonly unknown[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const n = active.filter((v) => v !== "" && v !== null && v !== undefined && v !== false).length;
  return (
    <section className={`wl-panel wl-filters${open ? " wl-filters-open" : ""}`}>
      <button type="button" className="wl-btn wl-filters-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <SlidersHorizontal aria-hidden="true" /> {open ? "Hide filters" : n ? `Filters (${n})` : "Filters"}
      </button>
      {children}
    </section>
  );
}
