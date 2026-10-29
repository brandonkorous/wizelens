import { ScrollRow, useScrollRow } from "./ScrollRow";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/** The page title and what the page is for. Children are the page's actions, on the right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="wl-page-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children && <div className="wl-page-actions">{children}</div>}
    </header>
  );
}

export interface PanelProps {
  title?: ReactNode;
  /** Right side of the header: a "View all" link, a select, or buttons. */
  action?: ReactNode;
  /** No inner padding, for full-width tables. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, action, flush = false, className = "", children }: PanelProps) {
  return (
    <section className={`wl-panel${flush ? " wl-panel-flush" : ""} ${className}`}>
      {(title || action) && (
        <div className="wl-panel-head">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <a className="wl-view-all" href={href}>
      {label} <ArrowRight aria-hidden="true" />
    </a>
  );
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="wl-empty">
      {title && <strong>{title}</strong>}
      {/* One block, so text, code, and links in the body flow as one paragraph. */}
      {children && <div className="wl-empty-body">{children}</div>}
    </div>
  );
}

export function KeyValues({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="wl-kv">
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  const bar = useScrollRow<HTMLDivElement>(value);
  return (
    <ScrollRow row={bar} className="wl-tabbar-row">
      <div ref={bar.ref} className="wl-tabbar" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? "wl-active" : ""} onClick={() => onChange(key)}>
            {label}
          </button>
        ))}
      </div>
    </ScrollRow>
  );
}
