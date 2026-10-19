import type { ComponentType, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export interface DetailHeadProps {
  /** Where "back" goes and what it says, for example ["#/errors", "All errors"]. */
  back: [href: string, label: string];
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  title: ReactNode;
  /** Long names (queries, routes) in the code font. */
  mono?: boolean;
  /** Next to the title: a status or a count. */
  badge?: ReactNode;
  actions?: ReactNode;
  /** Short facts under the title. */
  stats: [label: string, value: ReactNode][];
}

/** The header panel of a detail page: back link, icon and title, a badge, actions, and facts. */
export function DetailHead({ back, icon: Icon, title, mono = false, badge, actions, stats }: DetailHeadProps) {
  return (
    <section className="wl-panel wl-dhead">
      <a className="wl-back" href={back[0]}>
        <ArrowLeft size={14} aria-hidden="true" /> {back[1]}
      </a>
      <h1 className="wl-dhead-title">
        <Icon size={22} aria-hidden={true} />
        <span className={`wl-dhead-name${mono ? " wl-mono" : ""}`}>{title}</span>
        {badge && <span className="wl-dhead-badge">{badge}</span>}
        {actions && <span className="wl-dhead-actions">{actions}</span>}
      </h1>
      {stats.length > 0 && (
        <dl className="wl-stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
