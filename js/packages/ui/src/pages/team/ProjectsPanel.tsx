import { type FormEvent, useState } from "react";
import { loadAccount, type Project } from "../../data/account";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { CopyButton } from "../../ui/Badges";
import { useAsk } from "../../ui/Dialog";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { ProjectAccess } from "./ProjectAccess";
import type { OrgData } from "./teamTypes";
import { LogRetentionSelect } from "./LogRetentionSelect";

/** Add a project. Opens from the section's button. */
export function NewProjectForm({ orgId, reload, onClose }: { orgId: string; reload: () => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = (e: FormEvent) => {
    e.preventDefault();
    void act(() => apiSend("POST", `./api/orgs/${orgId}/projects`, { name }), () => (reload(), void loadAccount())).then((err) => (setError(err), err || onClose()));
  };
  return (
    <Panel title="New project" className="wl-panel-form" action={<button type="button" className="wl-link-btn" onClick={onClose}>Close</button>}>
      <form className="wl-form" onSubmit={add}>
        <FormRow>
          <Field label="Name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Checkout" autoFocus hint="Usually one app or team. Make an ingest key for it next." />
          <button type="submit" className="wl-btn wl-btn-primary">Add project</button>
        </FormRow>
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
      </form>
    </Panel>
  );
}

/** Projects of the organization, with what keys send to each and how long logs are kept: clear a project's data, or delete it. */
export function ProjectsPanel({ orgId, retentionDays, data, reload }: { orgId: string; retentionDays: number; data: OrgData; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<Project | null>(null);
  const limited = (p: Project) => data.projectRoles.filter((r) => r.projectId === p.id).length;
  const { dialog, confirm } = useAsk();
  const run = (fn: () => Promise<unknown>) => void act(fn, () => (reload(), void loadAccount())).then(setError);
  const keysOf = (p: Project) => data.keys.filter((k) => k.projectIds.includes(p.id)).length;
  const clear = async (p: Project) =>
    (await confirm({ title: `Clear the data of ${p.name}?`, body: "Every trace, log, and metric of this project is deleted. Its keys and alerts stay.", confirmLabel: "Clear data", danger: true, typeToConfirm: p.name })) &&
    run(() => apiSend("POST", `./api/orgs/${orgId}/projects/${p.id}/clear`));
  const remove = async (p: Project) =>
    (await confirm({ title: `Delete ${p.name}?`, body: "The project, its data, its keys, and its alerts are deleted. Apps that send with its keys stop being recorded.", confirmLabel: "Delete project", danger: true, typeToConfirm: p.name })) &&
    run(() => apiSend("DELETE", `./api/orgs/${orgId}/projects/${p.id}`));
  const columns: Column<Project>[] = [
    { key: "name", header: "Project", cell: (p) => <strong>{p.name}</strong> },
    { key: "id", header: "Project id", cell: (p) => <span className="wl-id">{p.id.slice(0, 8)}… <CopyButton text={p.id} label="Copy project id" /></span> },
    { key: "keys", header: "Keys", num: true, cell: (p) => keysOf(p) },
    { key: "logs", header: "Logs kept", cell: (p) => <LogRetentionSelect value={p.logRetentionDays ?? null} traceDays={retentionDays} onChange={(days) => run(() => apiSend("PATCH", `./api/orgs/${orgId}/projects/${p.id}`, { logRetentionDays: days }))} /> },
    { key: "access", header: "Access", cell: (p) => (limited(p) ? `${limited(p)} ${limited(p) === 1 ? "person has" : "people have"} their own role` : <span className="wl-muted">Organization roles</span>), className: "wl-nowrap" },
    {
      key: "x",
      header: "",
      className: "wl-cell-actions",
      cell: (p) => (
        <span className="wl-row-actions">
          <button type="button" className="wl-link-btn" onClick={() => setAccess(p)}>Access</button>
          <button type="button" className="wl-link-btn" onClick={() => void clear(p)}>Clear data</button>
          <button type="button" className="wl-link-btn wl-text-error" onClick={() => void remove(p)}>Delete</button>
        </span>
      ),
    },
  ];
  return (
    <>
      {access && <ProjectAccess key={access.id} orgId={orgId} project={access} data={data} reload={reload} onClose={() => setAccess(null)} />}
      <Panel flush>
        {error && <div className="wl-banner wl-banner-error wl-panel-banner">{error}</div>}
        <Table columns={columns} rows={data.projects} rowKey={(p) => p.id} />
        {dialog}
      </Panel>
    </>
  );
}
