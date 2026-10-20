import { METRIC_ALERT_STATS, type MetricAlertStat, type MetricsModel } from "@wizeworks/lens-core";
import { getScope } from "../../data/prefs";
import { useApi } from "../../data/useApi";
import { Select } from "../../ui/Controls";
import { Field, FormRow } from "../../ui/Field";
import type { RuleDraft } from "./AlertForm";
import { projectQuery } from "../../data/projectScope";

const STATS = Object.entries(METRIC_ALERT_STATS) as [MetricAlertStat, string][];
const LIST_ID = "wl-alert-metric-names";

/** The metric, the statistic, and the service of a metric rule. Names come from the last day of the project's metrics. */
export function MetricRuleFields({ r, set }: { r: RuleDraft; set: <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => void }) {
  const project = projectQuery();
  const { data } = useApi<MetricsModel>(project ? `./api/models/metrics?range=24h&${project}` : null);
  const chosen = data?.catalog.find((m) => m.name === r.metricName);
  return (
    <>
      <FormRow>
        <Field label="Metric name" required list={LIST_ID} value={r.metricName} onChange={(e) => set("metricName")(e.target.value)} placeholder="process.cpu.utilization" />
        <Select label="Read" value={(r.metricStat || "avg") as MetricAlertStat} options={STATS} onChange={set("metricStat")} />
        <Field label="Service (optional)" value={r.metricService} onChange={(e) => set("metricService")(e.target.value)} placeholder="All" />
      </FormRow>
      <datalist id={LIST_ID}>
        {data?.catalog.map((m) => (
          <option key={m.name} value={m.name}>
            {m.lastText}
          </option>
        ))}
      </datalist>
      <p className="wl-muted wl-small">
        The threshold is in the metric's base unit: seconds, bytes, or 0 to 1 for ratios (0.8 is 80%).
        {chosen && ` ${chosen.name} is in "${chosen.unit || "no unit"}" and reads ${chosen.lastText} now.`}
      </p>
    </>
  );
}
