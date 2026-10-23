import type { ComponentType, ReactNode } from "react";
import { Plus } from "lucide-react";
import { hrefTo, type PageId } from "../routes";

export interface Section {
  id: string;
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
  /** A small count next to the label, for example the number of members. */
  count?: number;
  render: () => ReactNode;
}

/** A settings-style page: a list of sections on the left (a strip of tabs on small screens), one section shown at a time. Each is its own URL. */
export function SectionLayout({ page, sections, active }: { page: PageId; sections: Section[]; active: string | undefined }) {
  const current = sections.find((s) => s.id === active) ?? sections[0];
  if (!current) return null;
  return (
    <div className="wl-sections">
      <nav className="wl-sections-nav" aria-label="Sections">
        {sections.map((s) => (
          <a key={s.id} href={hrefTo(page, [s.id])} className={s === current ? "wl-active" : ""} aria-current={s === current ? "page" : undefined}>
            <s.icon aria-hidden={true} />
            <span>{s.label}</span>
            {s.count !== undefined && <span className="wl-chip-count">{s.count}</span>}
          </a>
        ))}
      </nav>
      <div className="wl-sections-body">{current.render()}</div>
    </div>
  );
}

/** A section's main button, hidden while its form is open. */
export function AddButton({ label, open, onOpen }: { label: string; open: boolean; onOpen: () => void }) {
  if (open) return null;
  return <button type="button" className="wl-btn wl-btn-primary" onClick={onOpen}><Plus aria-hidden="true" /> {label}</button>;
}

/** The heading of one section, with what it is for and its main action (a button) on the right. */
export function SectionHead({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="wl-section-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="wl-section-actions">{action}</div>}
    </header>
  );
}
