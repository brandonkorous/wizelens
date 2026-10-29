import type { ComponentType } from "react";
import { Activity, Box, Siren, TriangleAlert } from "lucide-react";
import type { ProblemsModel, Sensitivity } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { fmtCount } from "../../format";
import { setQuery, useRoute } from "../../routes";
import { Select } from "../../ui/Controls";
import { ModelState } from "../../ui/ModelState";
import { PageHeader } from "../../ui/Panel";
import { NoProblem, ProblemDetail } from "./ProblemDetail";
import { ProblemList } from "./ProblemList";
import "../../styles/pages/problems.css";

const SENSITIVITY: [Sensitivity, string][] = [
  ["high", "High sensitivity"],
  ["medium", "Medium sensitivity"],
  ["low", "Low sensitivity"],
];

/** A count card in the stat grid, with a line under it. */
function CountCard({ icon: Icon, label, value, foot, danger = false }: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string; value: number; foot: string; danger?: boolean }) {
  return (
    <section className="wl-panel wl-stat">
      <Icon className={`wl-stat-icon${danger && value > 0 ? " wl-danger" : ""}`} aria-hidden={true} />
      <div className="wl-stat-label">{label}</div>
      <div />
      <div className="wl-stat-value">{fmtCount(value)}</div>
      <div className="wl-stat-foot wl-pb-foot">{foot}</div>
    </section>
  );
}

function Cards({ m }: { m: ProblemsModel }) {
  const normal = m.baseline.mode === "week" ? "same hour, earlier weeks" : "same hour, earlier days";
  // Four zeros say nothing the empty list below does not.
  if (!m.ongoing && !m.total && !m.anomalies && !m.services) return null;
  return (
    <div className="wl-grid wl-grid-stats">
      <CountCard icon={Siren} label="Ongoing" value={m.ongoing} foot="still above normal now" danger />
      <CountCard icon={TriangleAlert} label="Problems" value={m.total} foot="in this range" />
      <CountCard icon={Activity} label="Anomalies" value={m.anomalies} foot={`against the ${normal}`} />
      <CountCard icon={Box} label="Services Affected" value={m.services} foot="in any problem" />
    </div>
  );
}

function Learning({ m }: { m: ProblemsModel }) {
  if (!m.baseline.learning) return null;
  const what = m.baseline.mode === "week" ? "the same hour in earlier weeks" : "the same hour on earlier days";
  return (
    <div className="wl-banner wl-banner-info">
      WizeLens is learning what normal looks like. It compares each part of the range with {what}, and needs two of them with data (it has {m.baseline.samples}). Hosts that keep less than two weeks compare with earlier days.
    </div>
  );
}

function Header({ m }: { m: ProblemsModel | null }) {
  const value = (useRoute().query.get("sensitivity") as Sensitivity | null) ?? m?.sensitivity ?? "medium";
  return (
    <PageHeader title="Problems" subtitle="Services and endpoints above their normal error rate, p95, or traffic, grouped by the calls between them, with a suspected cause.">
      <Select label="Sensitivity" value={value} options={SENSITIVITY} onChange={(v) => setQuery({ sensitivity: v === "medium" ? null : v })} />
    </PageHeader>
  );
}

/** Problems, or one problem: from its path, or from an alert link's `problem`, `at`, and `service`. */
export function ProblemsPage() {
  const route = useRoute();
  const id = route.params[0] ?? null;
  const linked = id !== null || route.query.has("problem") || route.query.has("at");
  const { model, loading, error } = usePageModel("problems", id ? { problem: id } : undefined);
  return (
    <div className="wl-pb-page">
      {!linked && <Header m={model} />}
      <ModelState model={model} loading={loading} error={error} what="problems" />
      {model && <Learning m={model} />}
      {model && linked && (model.selected ? <ProblemDetail key={model.selected.id} p={model.selected} m={model} /> : <NoProblem />)}
      {model && !linked && (
        <>
          <Cards m={model} />
          <ProblemList m={model} />
        </>
      )}
    </div>
  );
}
