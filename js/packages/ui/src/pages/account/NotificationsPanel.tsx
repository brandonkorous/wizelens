import { useCallback, useEffect, useState } from "react";
import { browserZone, type DigestPeriod, type DigestRow, loadNotifications, type Notifications, type NotificationsPatch, saveNotifications, zones } from "../../data/notifications";
import { Check, SelectField } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { ActionNotes, useAction } from "./useAction";

const PERIODS: [DigestPeriod, string][] = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourText = (h: number) => `${h.toString().padStart(2, "0")}:00`;

function DigestTable({ rows, disabled, onChange }: { rows: DigestRow[]; disabled: boolean; onChange: (row: DigestRow, period: DigestPeriod, on: boolean) => void }) {
  // The organization is named only when the projects come from more than one.
  const orgs = new Set(rows.map((r) => r.org)).size > 1;
  const columns: Column<DigestRow>[] = [
    { key: "project", header: "Project", cell: (r) => <><b>{r.project}</b>{orgs && <> <span className="wl-muted wl-small">{r.org}</span></>}</> },
    ...PERIODS.map(([p, label]): Column<DigestRow> => ({
      key: p,
      header: label,
      cell: (r) => <input type="checkbox" className="wl-notify-box" aria-label={`${label} digest for ${r.project}`} checked={r[p]} disabled={disabled} onChange={(e) => onChange(r, p, e.target.checked)} />,
    })),
  ];
  return <Table paging={{ noun: "projects", key: "digest" }} columns={columns} rows={rows} rowKey={(r) => r.projectId} empty={<p className="wl-muted">No projects yet.</p>} />;
}

function WhenRow({ n, busy, save }: { n: Notifications; busy: boolean; save: (p: NotificationsPatch) => void }) {
  const here = browserZone();
  return (
    <div className="wl-form-row wl-notify-when">
      <SelectField label="Digests arrive at" value={String(n.digestHour)} options={HOURS.map((h): [string, string] => [String(h), hourText(h)])} disabled={busy || !n.digests} onChange={(h) => save({ digestHour: Number(h) })} />
      <SelectField label="Time zone" value={n.timeZone} options={zones(n.timeZone).map((z): [string, string] => [z, z])} disabled={busy} onChange={(z) => save({ timeZone: z })} />
      {here !== n.timeZone && <button type="button" className="wl-link-btn" disabled={busy} onClick={() => save({ timeZone: here })}>Use {here}</button>}
    </div>
  );
}

/** Which emails this person gets: security notices (always), team and health notices, and digests per project. */
export function NotificationsPanel() {
  const a = useAction();
  const [n, setN] = useState<Notifications | null>(null);
  const { run } = a;
  useEffect(() => void run(async () => setN(await loadNotifications())), [run]);
  const save = useCallback((patch: NotificationsPatch) => void run(async () => setN(await saveNotifications(patch)), "Saved."), [run]);
  const managesAny = n?.projects.some((p) => p.role === "owner" || p.role === "admin");
  return (
    <Panel>
      <ActionNotes a={a} />
      {n && !n.mail && <div className="wl-banner wl-banner-info">Mail is not set up on this cloud, so emails go to its log.</div>}
      {n && (
        <div className="wl-form">
          <p className="wl-muted wl-small">Security notices (password, email, two-step sign-in, passkeys, new devices) always go out.</p>
          {managesAny && <Check label="Team changes: members, roles, keys, projects, and single sign-on" checked={n.team} disabled={a.busy} onChange={(e) => save({ team: e.target.checked })} />}
          {managesAny && <Check label="Project health: a busy project stops sending data" checked={n.health} disabled={a.busy} onChange={(e) => save({ health: e.target.checked })} />}
          <Check label="Digests" checked={n.digests} disabled={a.busy} onChange={(e) => save({ digests: e.target.checked })} />
          <WhenRow n={n} busy={a.busy} save={save} />
          <DigestTable rows={n.projects} disabled={a.busy || !n.digests} onChange={(r, p, on) => save({ projects: [{ projectId: r.projectId, [p]: on }] })} />
        </div>
      )}
    </Panel>
  );
}
