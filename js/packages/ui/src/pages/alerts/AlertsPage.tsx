import { useState } from "react";
import { Plus } from "lucide-react";
import { cleanSearchParams, logSearchText } from "@wizeworks/lens-core";
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
import { type AlertEvent, type AlertRule, type AlertsData, channelLabel, eventPaging, lastValueText, ruleText, useAlertsApi, withEventPage } from "./alertTypes";
import { RuleActions, RuleState } from "./RuleActions";
import "../../styles/pages/alerts.css";
import { type InProject } from "../../data/projectScope";
import { projectColumn } from "../../ui/ProjectColumn";
import { RulesTable } from "./AlertsBulk";
import { useRuleTargets } from "./ruleTargets";

type Url = (path?: string) => string;

const sendsTo = (r: AlertRule) => r.channels.map(channelLabel).join(", ") || "Dashboard only";
/** On a phone, the rule, its last value, and where it sends, under its name. */
const phoneLine = (r: AlertRule) => `${ruleText(r)} · ${r.lastValue !== null ? "last " : ""}${lastValueText(r).toLowerCase()} · ${sendsTo(r)}`;

function ruleColumns(canWrite: boolean, url: Url, onDone: (note?: string) => void, onEdit: (r: AlertRule) => void, onDelete: (r: AlertRule) => void): Column<AlertRule>[] {
  return [
    { key: "name", header: "Alert", cell: (r) => <span className="wl-who"><strong>{r.name}</strong><small className="wl-phone-line">{phoneLine(r)}</small></span> },
    ...projectColumn<AlertRule>(),
    { key: "rule", header: "Rule", className: "wl-wrap", cell: (r) => ruleText(r), hideSm: true },
    { key: "state", header: "State", cell: (r) => <RuleState rule={r} /> },
    { key: "value", header: "Last value", num: true, cell: (r) => lastValueText(r), hideSm: true },
    { key: "to", header: "Sends to", cell: sendsTo, hideSm: true },
    ...(canWrite ? [{ key: "actions", header: "", className: "wl-cell-actions", cell: (r: AlertRule) => <RuleActions rule={r} url={url} onDone={onDone} onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} /> }] : []),
  ];
}

export const EVENT_TONE = { fired: "danger", resolved: "success", remind: "warning", test: "info", ack: "info", mute: "neutral", unmute: "neutral" } as const;
export const EVENT_LABEL = { fired: "Fired", resolved: "Resolved", remind: "Reminder", test: "Test", ack: "Acknowledged", mute: "Muted", unmute: "Unmuted" } as const;

export const eventColumns = (withRule: boolean): Column<AlertEvent>[] => [
  { key: "time", header: "When", cell: (e) => fmtAgo(e.timeMs), className: "wl-nowrap" },
  { key: "kind", header: "", cell: (e) => <Badge tone={EVENT_TONE[e.kind]}>{EVENT_LABEL[e.kind]}</Badge> },
  ...(withRule ? [{ key: "rule", header: "Alert", cell: (e: AlertEvent) => e.ruleName, className: "wl-wrap" }] : []),
  { key: "message", header: "Message", cell: (e) => <>{e.message}{e.problem && <a className="wl-alert-problem" href={e.problem.url.slice(e.problem.url.indexOf("#"))} onClick={(ev) => ev.stopPropagation()}>Problem: {e.problem.title}</a>}</>, className: "wl-wrap" },
  { key: "delivery", header: "Delivery", cell: (e) => <span className="wl-muted wl-small">{e.delivery}</span>, className: "wl-wrap" },
];

const TEXT_FIELDS = ["name", "metric", "service", "endpoint", "metricName", "metricStat", "metricService", "sloId", "op"] as const;
const NUMBER_FIELDS = ["threshold", "windowMs"] as const;
export const DRAFT_PARAMS = [...TEXT_FIELDS, ...NUMBER_FIELDS];

/** A new log count rule from the Logs page's "Alert on this search" (`log` holds its filters as JSON). */
function logRule(json: string): RuleDraft {
  let search: Record<string, string> = {};
  try {
    search = cleanSearchParams(JSON.parse(json));
  } catch {
    // A broken link starts from an empty search.
  }
  return { ...EMPTY_RULE, name: logSearchText(search).slice(0, 100) || "Log lines", metric: "log_count", threshold: 10, logSearch: search };
}

/** A new rule filled from the link's query (from "Alert on this"), or empty. */
function draftFromQuery(q: URLSearchParams): RuleDraft {
  const log = q.get("log");
  if (log) return logRule(log);
  const text = Object.fromEntries(TEXT_FIELDS.filter((k) => q.get(k)).map((k) => [k, q.get(k)]));
  const nums = Object.fromEntries(NUMBER_FIELDS.filter((k) => Number.isFinite(Number(q.get(k))) && q.get(k)).map((k) => [k, Number(q.get(k))]));
  return { ...EMPTY_RULE, ...text, ...nums } as RuleDraft;
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

/** A row's own project under "All projects". */
const owner = (r: AlertRule) => (r as InProject<AlertRule>).projectId;

function AlertRules() {
  const api = useAlertsApi();
  const query = useRoute().query;
  const { data, error, reload } = useApi<AlertsData>(api.ready ? withEventPage(api.url(), query) : null);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const targets = useRuleTargets();
  const [note, setNote] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const creating = query.get("new") === "1";
  const close = () => (setEditing(null), creating && setQuery({ new: null, log: null, ...Object.fromEntries(DRAFT_PARAMS.map((k) => [k, null])) }));
  const save = async (r: RuleDraft) => {
    const err = editing ? await act(() => apiSend("PATCH", api.url(`/${encodeURIComponent(editing.id)}`, owner(editing)), r), reload) : await targets.create(r, api.url, reload);
    if (!err) close();
    return err;
  };
  const done = (n?: string) => (setNote(n ?? null), reload());
  const remove = (r: AlertRule) => void act(() => apiSend("DELETE", api.url(`/${encodeURIComponent(r.id)}`, owner(r))), reload);
  const add = api.canWrite && <a className="wl-btn wl-btn-primary" href="#/alerts?new=1"><Plus aria-hidden="true" /> New alert</a>;
  const form = editing ? <AlertForm key={editing.id} title={`Edit "${editing.name}"`} initial={draftOf(editing)} onSave={save} onCancel={close} /> : creating && api.canWrite ? <AlertForm title="New alert" lead={targets.field} initial={draftFromQuery(query)} onSave={save} onCancel={close} /> : null;
  return (
    <>
      <PageHeader title="Alerts" subtitle="Get told when error rates, latency, traffic, or any metric cross a line. Checked every minute.">{add}</PageHeader>
      {(error || bulkError) && <div className="wl-banner wl-banner-error">{error || bulkError}</div>}
      {note && <div className="wl-banner wl-banner-info">{note}</div>}
      {form}
      <Panel title="Rules" flush>
        <RulesTable rules={data?.rules ?? []} columns={ruleColumns(api.canWrite, api.url, done, setEditing, remove)} canWrite={api.canWrite} url={api.url} onDone={(err) => (setBulkError(err), reload())} />
      </Panel>
      <Panel title="Recent notices" flush>
        <Table columns={eventColumns(true)} rows={data?.events ?? []} served={{ info: eventPaging(query, data?.eventCount ?? 0), noun: "notices" }} rowKey={(e) => e.id} onRowClick={(e) => navigate(alertHref(e.ruleId, e.projectId))} empty={<Empty>Nothing fired yet.</Empty>} />
      </Panel>
    </>
  );
}
