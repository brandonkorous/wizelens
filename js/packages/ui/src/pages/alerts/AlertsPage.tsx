import { useState } from "react";
import { BellRing, Plus } from "lucide-react";
import { ALERT_METRICS, METRIC_ALERT_STATS } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "../../data/account";
import { apiSend } from "../../data/api";
import { useHost } from "../../data/host";
import { getScope } from "../../data/prefs";
import { act, useApi } from "../../data/useApi";
import { fmtAgo } from "../../format";
import { Badge, DotText } from "../../ui/Badges";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { AlertForm, EMPTY_RULE, type RuleDraft } from "./AlertForm";
import { type AlertEvent, type AlertRule, type AlertsData, windowLabel } from "./alertTypes";

const unitOf = (r: AlertRule) => (r.metric === "metric" ? "" : ALERT_METRICS[r.metric].unit);
const plain = (v: number) => (Number.isInteger(v) ? String(v) : Math.abs(v) < 1 ? v.toPrecision(3) : v.toFixed(1));
const fmtValue = (r: AlertRule, v: number | null) => (v === null ? "–" : `${plain(v)}${unitOf(r) === "%" ? "%" : unitOf(r) ? ` ${unitOf(r)}` : ""}`);
const ruleLabel = (r: AlertRule) =>
  r.metric === "metric" ? `${r.metricName} ${METRIC_ALERT_STATS[r.metricStat || "avg"].toLowerCase()}${r.metricService ? ` (${r.metricService})` : ""}` : ALERT_METRICS[r.metric].label;

const SENSITIVITY_NAME: Record<number, string> = { 2: "high", 3: "medium", 4: "low" };
/** "> 5%", "< 10", or "above normal (medium)". */
const lineOf = (r: AlertRule) =>
  r.op === "above_normal" ? `above normal (${SENSITIVITY_NAME[r.threshold] ?? `${r.threshold} spreads`})` : `${r.op === ">" ? ">" : "<"} ${fmtValue(r, r.threshold)}`;

function ruleColumns(canWrite: boolean, onEdit: (r: AlertRule) => void, onTest: (r: AlertRule) => void, onDelete: (r: AlertRule) => void): Column<AlertRule>[] {
  return [
    { key: "name", header: "Alert", cell: (r) => <strong>{r.name}</strong> },
    { key: "rule", header: "Rule", cell: (r) => `${ruleLabel(r)} ${lineOf(r)} over ${windowLabel(r.windowMs)}${r.env ? ` · ${r.env}` : ""}` },
    { key: "state", header: "State", cell: (r) => (!r.enabled ? <Badge tone="neutral">Off</Badge> : <DotText tone={r.state === "firing" ? "danger" : "success"} colorText={r.state === "firing"}>{r.state === "firing" ? "Firing" : "OK"}</DotText>) },
    { key: "value", header: "Last value", num: true, cell: (r) => fmtValue(r, r.lastValue) },
    { key: "to", header: "Sends to", cell: (r) => r.channels.map((c) => c.kind).join(", ") || "Dashboard only" },
    ...(canWrite
      ? [{ key: "actions", header: "", cell: (r: AlertRule) => (
          <span className="wl-row-actions">
            <button type="button" className="wl-link-btn" onClick={() => onTest(r)}>Test</button>
            <button type="button" className="wl-link-btn" onClick={() => onEdit(r)}>Edit</button>
            <button type="button" className="wl-link-btn wl-text-error" onClick={() => onDelete(r)}>Delete</button>
          </span>
        ) }]
      : []),
  ];
}

const EVENT_TONE = { fired: "danger", resolved: "success", test: "info" } as const;
const EVENT_COLUMNS: Column<AlertEvent>[] = [
  { key: "time", header: "When", cell: (e) => fmtAgo(e.timeMs), className: "wl-nowrap" },
  { key: "kind", header: "", cell: (e) => <Badge tone={EVENT_TONE[e.kind]}>{e.kind === "fired" ? "Fired" : e.kind === "resolved" ? "Resolved" : "Test"}</Badge> },
  { key: "rule", header: "Alert", cell: (e) => e.ruleName },
  { key: "message", header: "Message", cell: (e) => <>{e.message}{e.problem && <a className="wl-alert-problem" href={e.problem.url.slice(e.problem.url.indexOf("#"))}>Problem: {e.problem.title}</a>}</>, className: "wl-wrap" },
  { key: "delivery", header: "Delivery", cell: (e) => <span className="wl-muted wl-small">{e.delivery}</span>, className: "wl-wrap" },
];

/** Alert rules of the selected project, and what they sent. */
/** Alerts on hosts that run them; elsewhere a note, so a typed or old link never calls an API the host lacks. */
export function AlertsPage() {
  if (useHost().has("alerts")) return <AlertRules />;
  return (
    <>
      <PageHeader title="Alerts" subtitle="Get told when error rates, latency, traffic, or any metric cross a line." />
      <Panel>
        <Empty title="This host does not run alerts">Alerts run on WizeLens Cloud. Send your data there to use them.</Empty>
      </Panel>
    </>
  );
}

function AlertRules() {
  const project = getScope().project;
  const { data, error, reload } = useApi<AlertsData>(project ? `./api/projects/${project}/alerts` : null);
  const role = currentProject(useAccount())?.org.role;
  const canWrite = role !== undefined && role !== "viewer";
  const [editing, setEditing] = useState<AlertRule | "new" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const base = `./api/projects/${project}/alerts`;
  const save = async (r: RuleDraft) => {
    const err = await act(() => (editing === "new" ? apiSend("POST", base, r) : apiSend("PATCH", `${base}/${(editing as AlertRule).id}`, r)), reload);
    if (!err) setEditing(null);
    return err;
  };
  const test = (r: AlertRule) => void apiSend<{ delivery: string }>("POST", `${base}/${r.id}/test`).then((x) => (setNote(`Test sent: ${x.delivery}`), reload()), (e: unknown) => setNote(String(e)));
  const remove = (r: AlertRule) => void act(() => apiSend("DELETE", `${base}/${r.id}`), reload);
  const add = canWrite && !editing && <button type="button" className="wl-btn wl-btn-primary" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> New alert</button>;
  return (
    <>
      <PageHeader title="Alerts" subtitle="Get told when error rates, latency, traffic, or any metric cross a line. Checked every minute.">{add}</PageHeader>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {note && <div className="wl-banner wl-banner-info">{note}</div>}
      {editing && <AlertForm initial={editing === "new" ? EMPTY_RULE : editing} onSave={save} onCancel={() => setEditing(null)} />}
      <Panel title="Rules" flush>
        <Table columns={ruleColumns(canWrite, setEditing, test, remove)} rows={data?.rules ?? []} rowKey={(r) => r.id} empty={<Empty title="No alerts yet"><BellRing aria-hidden="true" /> Add one to hear about problems before your users do.</Empty>} />
      </Panel>
      <Panel title="Recent notices" flush>
        <Table columns={EVENT_COLUMNS} rows={data?.events ?? []} rowKey={(e) => e.id} empty={<Empty>Nothing fired yet.</Empty>} />
      </Panel>
    </>
  );
}
