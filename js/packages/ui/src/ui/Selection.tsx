import { type ReactNode, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { TableSelect } from "./Table";

/** Rows picked with tick boxes. Ids no longer in `ids` drop out, so a reload never acts on a gone row. */
export function useSelection(ids: readonly string[], noun: string) {
  const [raw, setRaw] = useState<Set<string>>(() => new Set());
  const known = useMemo(() => new Set(ids), [ids]);
  const picked = useMemo(() => new Set([...raw].filter((id) => known.has(id))), [raw, known]);
  const select: TableSelect = { picked, onChange: setRaw, noun, pickable: (id) => known.has(id) };
  return { picked: [...picked], select, clear: () => setRaw(new Set()) };
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The actions for the picked rows. Shown only while something is picked. */
export function SelectionBar({ count, noun, onClear, children }: { count: number; noun: string; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="wl-select-bar" role="region" aria-label="Actions for the selected rows">
      <strong>{plural(count, noun)} selected</strong>
      <div className="wl-select-actions">{children}</div>
      <button type="button" className="wl-link-btn wl-select-clear" onClick={onClear}><X aria-hidden="true" /> Clear</button>
    </div>
  );
}

/** A small search box that narrows a list in this page, for example keys by name or project. */
export function ListFilter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="wl-input wl-list-filter">
      <Search aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

/** True when every word of `text` is in one of the row's texts (case does not matter). */
export function matchesText(text: string, ...fields: (string | null | undefined)[]): boolean {
  const hay = fields.join(" ").toLowerCase();
  return text.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
