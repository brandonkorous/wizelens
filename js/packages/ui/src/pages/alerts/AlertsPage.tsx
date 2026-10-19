import { useState } from "react";
import { BellRing, Plus } from "lucide-react";
import { apiSend } from "../../data/api";
import { useHost } from "../../data/host";
import { act, useApi } from "../../data/useApi";
import { fmtAgo } from "../../format";
import { alertHref, decodeParam, navigate, setQuery, useRoute } from "../../routes";
import { Badge } from "../../ui/Badges";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { AlertForm, draftOf, EMPTY_RULE, type RuleDraft } from "./AlertForm";
import { AlertRulePage } from "./AlertRulePage";
import { type AlertEvent, type AlertRule, type AlertsData, channelLabel, fmtValue, ruleText, useAlertsApi } from "./alertTypes";
import { RuleActions, RuleState } from "./RuleActions";
import "../../styles/pages/alerts.css";

type Url = (path?: string) => string;

function ruleColumns(canWrite: boolean, url: Url, onDone: (note?: string) => void, onEdit: (r: AlertRule) => void, onDelete: (r: AlertRule) => void): Column<AlertRule>[] {
  return [
    { key: "name", header: "Alert", cell: (r) => <strong>{r.name}</strong> },
    { key: "rule", header: "Rule", className: "wl-wrap", cell: (r) => ruleText(r) },
    { key: "state", header: "State", cell: (r) => <RuleState rule={r} /> },
    { key: "value", header: "Last value", num: true, cell: (r) => fmtValue(r, r.lastValue) },
    { key: "to", header: "Sends to", cell: (r) => r.channels.map(channelLabel).join(", ") || "Dashboard only" },
    ...(canWrite ? [{ key: "actions", header: "", cell: (r: AlertRule) => <RuleActions rule={r} url={url} onDone={onDone} onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} /> }] : []),
  ];
}

export const EVENT_TONE = { fired: "danger", resolved: "success", remind: "warning", test: "info", ack: "info", mute: "neutral", unmute: "neutral" } as const;
export const EVENT_LABEL = { fired: "Fired", resolved: "Resolved", remind: "Reminder", test: "Test", ack: "Acknowledged", mute: "Muted", unmute: "Unmuted" } as const;

export const eventColumns = (withRule: boolean): Column<AlertEvent>[] => [
  { key: "time", header: "When", cell: (e) => fmtAgo(e.timeMs), className: "wl-nowrap" },
  { key: "kind", header: "", cell: (e) => <Badge tone={EVENT_TONE[e.kind]}>{EVENT_LABEL[e.kind]}</Badge> },
  ...(withRule ? [{ key: "rule", header: "Alert", cell: (e: AlertEvent) => e.ruleName }] : []),
  { key: "message", header: "Message", cell: (e) => e.message, className: "wl-wrap" },
  { key: "delivery", header: "Delivery", cell: (e) => <span className="wl-muted wl-small">{e.delivery}</span>, className: "wl-wrap" },
];

/** A new rule filled from the link's query (from "Alert on this"), or empty. */
function draftFromQuery(q: URLSearchParams): RuleDraft {
  const pick = (k: keyof RuleDraft) => (q.get(k) ? { [k]: q.get(k) } : {});
  return { ...EMPTY_RULE, ...pick("name"), ...pick("metric"), ...pick("service"), ...pick("endpoint"), ...pick("metricName"), ...pick("metricStat"), ...pick("metricService") } as RuleDraft;
}

/** Alerts on hosts that run them; elsewhere a note, so a typed or old link never calls an API the host lacks. */
export function AlertsPage() {
  const [id] = useRoute().params;
  if (!useHost().has("alerts")) {
    return (
      <>
        <PageHeader title="Alerts" subtitle="Get told when error rates, latency, traffic, or any metric cross a line." />
        <Panel>
          <Empty title="This host does not run alerts">Alerts run on the hub and on WizeLens Cloud. Send your data there to use them.</Empty>
        </Panel>
      </>
    );
  }
  return id ? <AlertRulePage key={id} id={decodeParam(id)} /> : <AlertRules />;
}

function AlertRules() {
  const api = useAlertsApi();
  const query = useRoute().query;
  const { data, error, reload } = useApi<AlertsData>(api.ready ? api.url() : null);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const creating = query.get("new") === "1";
  const close = () => (setEditing(null), creating && setQuery({ new: null, metric: null, service: null, endpoint: null, metricName: null, metricStat: null, metricService: null, name: null }));
  const save = async (r: RuleDraft) => {
    const err = await act(() => (editing ? apiSend("PATCH", api.url(`/${encodeURIComponent(editing.id)}`), r) : apiSend("POST", api.url(), r)), reload);
    if (!err) close();
    return err;
  };
  const done = (n?: string) => (setNote(n ?? null), reload());
  const remove = (r: AlertRule) => void act(() => apiSend("DELETE", api.url(`/${encodeURIComponent(r.id)}`)), reload);
  const add = api.canWrite && !editing && !creating && <a className="wl-btn wl-btn-primary" href="#/alerts?new=1"><Plus aria-hidden="true" /> New alert</a>;
  const form = editing ? <AlertForm key={editing.id} title={`Edit "${editing.name}"`} initial={draftOf(editing)} onSave={save} onCancel={close} /> : creating && api.canWrite ? <AlertForm title="New alert" initial={draftFromQuery(query)} onSave={save} onCancel={close} /> : null;
  return (
    <>
      <PageHeader title="Alerts" subtitle="Get told when error rates, latency, traffic, or any metric cross a line. Checked every minute.">{add}</PageHeader>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {note && <div className="wl-banner wl-banner-info">{note}</div>}
      {form}
      <Panel title="Rules" flush>
        <Table columns={ruleColumns(api.canWrite, api.url, done, setEditing, remove)} rows={data?.rules ?? []} rowKey={(r) => r.id} onRowClick={(r) => navigate(alertHref(r.id))} empty={<Empty title="No alerts yet"><BellRing aria-hidden="true" /> Add one to hear about problems before your users do.</Empty>} />
      </Panel>
      <Panel title="Recent notices" flush>
        <Table columns={eventColumns(true)} rows={data?.events ?? []} rowKey={(e) => e.id} onRowClick={(e) => navigate(alertHref(e.ruleId))} empty={<Empty>Nothing fired yet.</Empty>} />
      </Panel>
    </>
  );
}
