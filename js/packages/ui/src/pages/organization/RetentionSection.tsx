import { type FormEvent, useState } from "react";
import { loadAccount, type OrgWithProjects } from "../../data/account";
import { apiSend } from "../../data/api";
import { useUsage } from "../../data/billing";
import { type SettingsReply, settingsBody, useSettingsProjects } from "../../data/projectSettings";
import { act, useApi } from "../../data/useApi";
import { Field, FormRow } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { usePagedRows } from "../../ui/PagedRows";
import { SectionHead } from "../../ui/Sections";
import { DaysSelect } from "./DaysSelect";
import { canManage } from "./orgTypes";

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** The longest any project of the organization keeps data, up to what the plan allows. Owners and admins change it. */
function OrgRetention({ org }: { org: OrgWithProjects }) {
  const usage = useUsage(org.id).data;
  const max = usage?.billing ? usage.maxRetentionDays : 400;
  const [value, setValue] = useState(org.retentionDays);
  const [note, setNote] = useState<string | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void act(() => apiSend("PATCH", `./api/orgs/${org.id}`, { retentionDays: value }), () => void loadAccount()).then((err) => setNote(err ?? "Saved."));
  };
  if (!canManage(org.role)) return <Panel><p className="wl-settings-note">{org.name} keeps data for at most {days(org.retentionDays)}.</p></Panel>;
  return (
    <Panel title="Longest any project keeps data">
      <form className="wl-form" onSubmit={save}>
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
  onChange: (days: number | null) => void;
}

/** One project: how long its traces stay (its own days, or the host's), and on the cloud its logs. */
function RetentionRow({ name, url, canEdit, host, logs }: { name: string; url: string; canEdit: boolean; host: string; logs?: LogDays }) {
  const { data, reload } = useApi<SettingsReply>(url);
  const [error, setError] = useState<string | null>(null);
  if (!data) return <tr><td><strong>{name}</strong></td><td colSpan={logs ? 2 : 1} className="wl-muted">Loading…</td></tr>;
  const kept = data.effective.retentionDays;
  const setTraces = (d: number | null) => void act(() => apiSend("PUT", url, settingsBody(data.settings, { retentionDays: d })), reload).then(setError);
  return (
    <tr>
      <td><strong>{name}</strong>{error && <div className="wl-text-error wl-small" role="alert">{error}</div>}</td>
      <td>{canEdit ? <DaysSelect label={`Traces kept in ${name}`} value={data.settings.retentionDays ?? null} max={data.defaults.retentionDays} fallback={`Like the ${host} (${days(data.defaults.retentionDays)})`} onChange={setTraces} /> : days(kept)}</td>
      {logs && <td>{canEdit ? <DaysSelect label={`Logs kept in ${name}`} value={logs.value} max={400} fallback={`Like traces (${days(kept)})`} onChange={logs.onChange} /> : logs.value === null ? `Like traces (${days(kept)})` : days(logs.value)}</td>}
    </tr>
  );
}

/** Every project's retention in one table: traces on every host, logs too on the cloud. */
function ProjectsRetention({ org }: { org: OrgWithProjects | null }) {
  const sp = useSettingsProjects();
  const [error, setError] = useState<string | null>(null);
  const setLogs = (id: string, d: number | null) => void act(() => apiSend("PATCH", `./api/orgs/${org!.id}/projects/${id}`, { logRetentionDays: d }), () => void loadAccount()).then(setError);
  const logsOf = (id: string): LogDays | undefined => (org ? { value: org.projects.find((p) => p.id === id)?.logRetentionDays ?? null, onChange: (d) => setLogs(id, d) } : undefined);
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
  const where = org ? "Older data is deleted within minutes. A project never keeps data longer than the organization." : "Older data is deleted within minutes. A project's days apply to its traces and logs, and are never longer than the hub's.";
  return (
    <>
      <SectionHead title="Data retention" description={`How long traces and logs are kept. ${where}`} />
      {org && <OrgRetention key={org.id} org={org} />}
      <ProjectsRetention org={org} />
    </>
  );
}
