import { type ComponentType, type ReactNode, useState } from "react";
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

/** A code-font name that may break after / . ? & = and before spaces, never inside a word. */
const breakable = (name: string) => name.split(/(?<=[/.?&=])/).map((part, i) => <span key={i}>{i > 0 && <wbr />}{part}</span>);

/** A long code-font title shows three lines on a phone until "Show all" (detail.css). */
const LONG = 120;

/** The header panel of a detail page: back link, icon and title, a badge, actions, and facts. */
export function DetailHead({ back, icon: Icon, title, mono = false, badge, actions, stats }: DetailHeadProps) {
  const [open, setOpen] = useState(false);
  const long = mono && typeof title === "string" && title.length > LONG;
  return (
    <section className="wl-panel wl-dhead">
      <a className="wl-back" href={back[0]}>
        <ArrowLeft size={14} aria-hidden="true" /> {back[1]}
      </a>
      <h1 className="wl-dhead-title">
        <Icon size={22} aria-hidden={true} />
        <span className={`wl-dhead-name${mono ? " wl-mono" : ""}${long && !open ? " wl-clamped" : ""}`}>{mono && typeof title === "string" ? breakable(title) : title}</span>
        {badge && <span className="wl-dhead-badge">{badge}</span>}
      </h1>
      {long && <button type="button" className="wl-link-btn wl-dhead-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Show less" : "Show all"}</button>}
      {actions && <div className="wl-dhead-actions">{actions}</div>}
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
