import { useState } from "react";
import { Check } from "./Field";
import { ListFilter, matchesText } from "./Selection";

export interface PickableProject {
  id: string;
  name: string;
}

const SHOWN = 200;

/** Pick many projects: a filter, "select all shown", and a box per project. Long lists show the first 200 that match. */
export function ProjectPicker({ projects, picked, onChange, legend }: { projects: PickableProject[]; picked: string[]; onChange: (ids: string[]) => void; legend: string }) {
  const [filter, setFilter] = useState("");
  const shown = projects.filter((p) => matchesText(filter, p.name));
  const on = new Set(picked);
  const allShown = shown.length > 0 && shown.every((p) => on.has(p.id));
  const toggleShown = () => onChange(allShown ? picked.filter((id) => !shown.some((p) => p.id === id)) : [...new Set([...picked, ...shown.map((p) => p.id)])]);
  const toggle = (id: string, yes: boolean) => onChange(yes ? [...picked, id] : picked.filter((x) => x !== id));
  return (
    <fieldset className="wl-check-list wl-project-picker">
      <legend>{legend}</legend>
      <div className="wl-project-picker-tools">
        {projects.length > 8 && <ListFilter value={filter} onChange={setFilter} placeholder="Filter projects" />}
        <button type="button" className="wl-link-btn" onClick={toggleShown}>{allShown ? "Clear these" : filter ? `Select all ${shown.length} shown` : "Select all"}</button>
        <span className="wl-muted wl-small">{picked.length} of {projects.length} picked</span>
      </div>
      <div className="wl-project-picker-list">
        {shown.slice(0, SHOWN).map((p) => <Check key={p.id} label={p.name} checked={on.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />)}
        {shown.length > SHOWN && <span className="wl-muted wl-small">And {shown.length - SHOWN} more. Filter to find them, or use Select all.</span>}
        {shown.length === 0 && <span className="wl-muted wl-small">No project matches.</span>}
      </div>
    </fieldset>
  );
}
