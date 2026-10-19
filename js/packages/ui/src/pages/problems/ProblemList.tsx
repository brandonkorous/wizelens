import { ChevronRight } from "lucide-react";
import type { Problem, ProblemsModel } from "@wizeworks/lens-core";
import { fmtCount } from "../../format";
import { Dot } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { CauseLine, problemHref, whenText } from "./problemParts";

/** One problem: status, title, when, the services in it, and its suspected cause. */
function ProblemCard({ p, now }: { p: Problem; now: number }) {
  return (
    <li className={`wl-pb-card${p.ongoing ? " wl-pb-ongoing" : ""}`}>
      <a className="wl-pb-card-head" href={problemHref(p)}>
        <Dot tone={p.ongoing ? "danger" : "neutral"} title={p.ongoing ? "Ongoing" : "Over"} />
        <strong className="wl-pb-title">{p.title}</strong>
        <span className="wl-pb-when">{whenText(p, now)}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </a>
      <div className="wl-chips">
        {p.services.slice(0, 6).map((s) => (
          <span key={s.row} className="wl-chip">{s.name}</span>
        ))}
        {p.services.length > 6 && <span className="wl-chip">+{p.services.length - 6} more</span>}
        <span className="wl-chip wl-chip-red">{fmtCount(p.anomalyCount)} {p.anomalyCount === 1 ? "anomaly" : "anomalies"}</span>
      </div>
      {p.cause ? <CauseLine cause={p.cause} /> : <p className="wl-pb-nocause">No cause stands out: no new release, new error, slower query, or service further down the calls.</p>}
    </li>
  );
}

function EmptyList({ m }: { m: ProblemsModel }) {
  if (m.baseline.learning) return <Empty title="No problems yet">Problems show up once WizeLens knows what normal looks like here.</Empty>;
  return <Empty title="No problems in this range">Every service and endpoint stayed within its normal error rate, p95, and traffic.</Empty>;
}

/** Ongoing problems first, then the newest. */
export function ProblemList({ m }: { m: ProblemsModel }) {
  const now = m.meta.window.to;
  const title = m.total > m.problems.length ? `Problems (${fmtCount(m.problems.length)} of ${fmtCount(m.total)})` : `Problems (${fmtCount(m.total)})`;
  return (
    <Panel title={title}>
      {m.problems.length ? (
        <ul className="wl-pb-list">
          {m.problems.map((p) => (
            <ProblemCard key={p.id} p={p} now={now} />
          ))}
        </ul>
      ) : (
        <EmptyList m={m} />
      )}
    </Panel>
  );
}
