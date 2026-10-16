import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="wl-page-head">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
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
      {children}
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
  return (
    <div className="wl-tabbar" role="tablist">
      {tabs.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? "wl-active" : ""} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
