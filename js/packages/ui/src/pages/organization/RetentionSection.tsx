import { type FormEvent, useState } from "react";
import { loadAccount, type OrgWithProjects } from "../../data/account";
import { apiSend } from "../../data/api";
import { useUsage } from "../../data/billing";
import { type SettingsReply, settingsBody, useSettingsProjects } from "../../data/projectSettings";
import { act, useApi } from "../../data/useApi";
import { useAsk } from "../../ui/Dialog";
import { Field, FormRow } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { usePagedRows } from "../../ui/PagedRows";
import { SectionHead } from "../../ui/Sections";
import { DaysSelect } from "./DaysSelect";
import { canManage } from "./orgTypes";
import { shortenAsk } from "./shortenAsk";

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** The longest any project of the organization keeps data, up to what the plan allows. Owners and admins change it. */
function OrgRetention({ org }: { org: OrgWithProjects }) {
  const usage = useUsage(org.id).data;
  const max = usage?.billing ? usage.maxRetentionDays : 400;
  const [value, setValue] = useState(org.retentionDays);
  const [note, setNote] = useState<string | null>(null);
  const { dialog, confirm } = useAsk();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (value < org.retentionDays && !(await confirm(shortenAsk("Traces and logs in every project", org.retentionDays, value)))) return;
    void act(() => apiSend("PATCH", `./api/orgs/${org.id}`, { retentionDays: value }), () => void loadAccount()).then((err) => setNote(err ?? "Saved."));
  };
  if (!canManage(org.role)) return <Panel><p className="wl-settings-note">{org.name} keeps data for at most {days(org.retentionDays)}.</p></Panel>;
  return (
    <Panel title="Longest any project keeps data">
      {dialog}
      <form className="wl-form" onSubmit={(e) => void save(e)}>
        <FormRow>
          <Field label="Days" narrow type="number" min={1} max={max} required value={value} onChange={(e) => setValue(Number(e.target.value))} hint={`1 to ${max}${max < 400 ? ` on the ${usage?.plan.name} plan` : ""}. A project can keep its data for less, below.`} />
          <button type="submit" className="wl-btn wl-btn-primary">Save</button>
        </FormRow>
        {note && <p className="wl-muted wl-small" role="status">{note}</p>}
      </form>
    </Panel>
  );
}

/** Log lines of a cloud project: their own days, or like its traces. */
interface LogDays {
  value: number | null;
  /** The plan's longest retention: logs may outlast traces, never the plan. */
  max: number;
  onChange: (days: number | null) => void;
}

/** One project: how long its traces stay (its own days, or the host's), and on the cloud its logs. */
function RetentionRow({ name, url, canEdit, host, logs }: { name: string; url: string; canEdit: boolean; host: string; logs?: LogDays }) {
  const { data, reload } = useApi<SettingsReply>(url);
  const [error, setError] = useState<string | null>(null);
  const { dialog, confirm } = useAsk();
  if (!data) return <tr><td><strong>{name}</strong></td><td colSpan={logs ? 2 : 1} className="wl-muted">Loading…</td></tr>;
  const kept = data.effective.retentionDays;
  const shorter = async (items: string, from: number, to: number) => to >= from || (await confirm(shortenAsk(`${items} in ${name}`, from, to)));
  const setTraces = async (d: number | null) => (await shorter("Traces", kept, d ?? data.defaults.retentionDays)) && void act(() => apiSend("PUT", url, settingsBody(data.settings, { retentionDays: d })), reload).then(setError);
  const setLogs = async (d: number | null) => logs && (await shorter("Logs", logs.value ?? kept, d ?? kept)) && logs.onChange(d);
  return (
    <tr>
      <td>{dialog}<strong>{name}</strong>{error && <div className="wl-text-error wl-small" role="alert">{error}</div>}</td>
      <td>{canEdit ? <DaysSelect label={`Traces kept in ${name}`} value={data.settings.retentionDays ?? null} max={data.defaults.retentionDays} fallback={`Like the ${host} (${days(data.defaults.retentionDays)})`} onChange={(d) => void setTraces(d)} /> : days(kept)}</td>
      {logs && <td>{canEdit ? <DaysSelect label={`Logs kept in ${name}`} value={logs.value} max={logs.max} fallback={`Like traces (${days(kept)})`} onChange={(d) => void setLogs(d)} /> : logs.value === null ? `Like traces (${days(kept)})` : days(logs.value)}</td>}
    </tr>
  );
}

/** Every project's retention in one table: traces on every host, logs too on the cloud. */
function ProjectsRetention({ org }: { org: OrgWithProjects | null }) {
  const sp = useSettingsProjects();
  const usage = useUsage(org?.id ?? null).data;
  const logMax = usage?.billing ? usage.maxRetentionDays : 400;
  const [error, setError] = useState<string | null>(null);
  const setLogs = (id: string, d: number | null) => void act(() => apiSend("PATCH", `./api/orgs/${org!.id}/projects/${id}`, { logRetentionDays: d }), () => void loadAccount()).then(setError);
  const logsOf = (id: string): LogDays | undefined => (org ? { value: org.projects.find((p) => p.id === id)?.logRetentionDays ?? null, max: logMax, onChange: (d) => setLogs(id, d) } : undefined);
  const shown = usePagedRows(sp.options, { noun: "projects", key: "retention" });
  if (sp.options.length === 0) return <Panel><Empty title="No projects yet" /></Panel>;
  return (
    <Panel title="Each project" flush>
      {error && <div className="wl-banner wl-banner-error wl-panel-banner">{error}</div>}
      <div className="wl-table-wrap">
        <table className="wl-table">
          <thead><tr><th>Project</th><th>Traces kept</th>{org && <th>Logs kept</th>}</tr></thead>
          <tbody>
            {shown.rows.map(([id, name]) => <RetentionRow key={id} name={name} url={sp.url(id)} canEdit={sp.canEdit(id)} host={org ? "organization" : "hub"} logs={logsOf(id)} />)}
          </tbody>
        </table>
      </div>
      {shown.pager}
    </Panel>
  );
}

/** How long data is kept, all in one place: the organization's longest (cloud), then each project's traces and logs. */
export function RetentionSection({ org }: { org: OrgWithProjects | null }) {
  const where = org ? "Older data is deleted within minutes. A project never keeps traces longer than the organization. Its logs can have their own days, up to what the plan allows." : "Older data is deleted within minutes. A project's days apply to its traces and logs, and are never longer than the hub's.";
  return (
    <>
      <SectionHead title="Data retention" description={`How long traces and logs are kept. ${where}`} />
      {org && <OrgRetention key={org.id} org={org} />}
      <ProjectsRetention org={org} />
    </>
  );
}
