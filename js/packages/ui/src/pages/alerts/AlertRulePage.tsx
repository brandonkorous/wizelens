import { type ReactNode, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { ALERT_METRICS, type AlertRule, TIME_RANGES } from "@wizeworks/lens-core";
import { useRange } from "../../data/host";
import { parseWindow, useWindowPref } from "../../data/period";
import { useApi } from "../../data/useApi";
import { fmtDateTime } from "../../format";
import { hrefTo } from "../../routes";
import { DetailHead } from "../../ui/DetailHead";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { Table } from "../../ui/Table";
import { TimeChart } from "../../ui/TimeChart";
import { eventColumns } from "./AlertsPage";
import { type AlertRuleData, channelLabel, fmtValue, ruleText, useAlertsApi, windowLabel } from "./alertTypes";
import { RuleActions, RuleState } from "./RuleActions";

const BUCKETS = 60;

/** The values in even buckets (the last value of each), for the chart. */
function bucketed(values: AlertRuleData["values"], from: number, to: number): { starts: number[]; values: (number | null)[] } {
  const size = (to - from) / BUCKETS;
  const starts = Array.from({ length: BUCKETS }, (_, i) => from + i * size);
  const out: (number | null)[] = new Array<number | null>(BUCKETS).fill(null);
  for (const v of values) {
    const i = Math.floor((v.timeMs - from) / size);
    if (i >= 0 && i < BUCKETS && v.value !== null) out[i] = v.value;
  }
  return { starts, values: out };
}

/** Where the traces behind a trace rule are: failed requests, slow requests, new errors, or slow queries of its scope and window. */
function tracesHref(rule: AlertRule, from: number, to: number): string | null {
  if (rule.metric === "metric") return null;
  if (rule.metric === "slo") return hrefTo("slos", [encodeURIComponent(rule.sloId)]);
  const scope = { ...(rule.service ? { service: rule.service } : {}), ...(rule.endpoint ? { endpoint: rule.endpoint } : {}), from: String(from), to: String(to) };
  if (rule.metric === "new_errors") return hrefTo("errors", [], { ...scope, new: "1" });
  if (rule.metric === "slow_queries") return hrefTo("database", [], { ...scope, sort: "total" });
  if (rule.metric === "error_rate") return hrefTo("requests", [], { ...scope, status: "failed" });
  return hrefTo("requests", [], { ...scope, sort: "duration" });
}

/** The window the page shows: the custom one at the top, or the chosen range up to now. */
function useShownWindow(): { from: number; to: number } {
  const [range] = useRange();
  const [text] = useWindowPref();
  return useMemo(() => {
    const custom = parseWindow(text);
    const to = custom?.to ?? Date.now();
    return { from: custom?.from ?? to - TIME_RANGES[range].ms, to };
  }, [range, text]);
}

function Body({ d, api, reload }: { d: AlertRuleData; api: ReturnType<typeof useAlertsApi>; reload: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const w = useShownWindow();
  const r = d.rule;
  const chart = bucketed(d.values, w.from, w.to);
  const unit = r.metric === "metric" ? undefined : r.metric === "slo" ? "×" : ALERT_METRICS[r.metric].unit;
  const fmt = (v: number) => fmtValue(r, v);
  const traces = tracesHref(r, w.from, w.to);
  const stats: [string, ReactNode][] = [["Rule", ruleText(r)], ["Last value", fmtValue(r, r.lastValue)], ["Checked", r.lastEvalMs ? fmtDateTime(r.lastEvalMs) : "Not yet"], ["Sends to", r.channels.map(channelLabel).join(", ") || "Dashboard only"]];
  const actions = api.canWrite ? <RuleActions rule={r} url={api.url} onDone={(n) => (setNote(n ?? null), reload())} /> : undefined;
  return (
    <>
      <DetailHead back={["#/alerts", "All alerts"]} icon={BellRing} title={r.name} badge={<RuleState rule={r} />} actions={actions} stats={stats} />
      {note && <div className="wl-banner wl-banner-info">{note}</div>}
      <Panel title={`Value Against the Line (every check, ${windowLabel(r.windowMs)} windows)`} action={traces && <ViewAll href={traces} label="View the traces" />}>
        <TimeChart starts={chart.starts} format={unit === undefined ? undefined : fmt} lines={[{ label: "Value", values: chart.values, color: "var(--wl-blue)" }, { label: "Threshold", values: chart.values.map(() => r.threshold), color: "var(--wl-red)", dashed: true }]} />
      </Panel>
      <Panel title="Notices and Changes" flush>
        <Table columns={eventColumns(false)} rows={d.events} rowKey={(e) => e.id} empty={<Empty>Nothing happened to this alert yet.</Empty>} />
      </Panel>
    </>
  );
}

/** One alert rule: where it stands, its value against the line over the chosen time, and what it sent. */
export function AlertRulePage({ id }: { id: string }) {
  const api = useAlertsApi();
  const w = useShownWindow();
  const url = api.url(`/${encodeURIComponent(id)}`);
  const { data, error, reload } = useApi<AlertRuleData>(api.ready ? `${url}${url.includes("?") ? "&" : "?"}from=${w.from}&to=${w.to + 1}` : null);
  if (error) return <Panel><Empty title="This alert was not found">{error} Go back to <a href="#/alerts">all alerts</a>.</Empty></Panel>;
  return <div className="wl-dpage">{data ? <Body d={data} api={api} reload={reload} /> : <Panel><Empty>Loading…</Empty></Panel>}</div>;
}
