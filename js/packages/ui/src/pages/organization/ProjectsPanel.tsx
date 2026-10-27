import { type FormEvent, useState } from "react";
import { loadAccount, type Project } from "../../data/account";
import { hrefTo } from "../../routes";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { CopyButton } from "../../ui/Badges";
import { useAsk } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import { Empty, Panel } from "../../ui/Panel";
import { ListFilter, matchesText } from "../../ui/Selection";
import { useProjectsBulk } from "./ProjectsBulk";
import { type Column, Table } from "../../ui/Table";
import type { OrgData } from "./orgTypes";

/** Add a project, or rename `project`. Keys, data, and links keep working after a rename: they use the project id. */
export function NewProjectForm({ orgId, project, reload, onClose }: { orgId: string; project?: Project; reload: () => void; onClose: () => void }) {
  const [name, setName] = useState(project?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const send = project ? () => apiSend("PATCH", `./api/orgs/${orgId}/projects/${project.id}`, { name }) : () => apiSend("POST", `./api/orgs/${orgId}/projects`, { name });
    void act(send, () => (reload(), void loadAccount())).then((err) => (setError(err), err || onClose()));
  };
  const hint = project ? "Keys, data, alerts, and links stay as they are." : "Usually one app or team. Make a sending key for it next, under Connect.";
  return (
    <Modal title={project ? `Rename ${project.name}` : "New project"} onClose={onClose}>
      <form className="wl-form" onSubmit={save}>
        <Field label="Name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Checkout" autoFocus hint={hint} />
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <div className="wl-form-actions">
          <button type="button" className="wl-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="wl-btn wl-btn-primary">{project ? "Rename" : "Add project"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Projects of the organization, with how many keys send to each: clear a project's data, or delete it. */
export function ProjectsPanel({ orgId, data, reload }: { orgId: string; data: OrgData; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [renaming, setRenaming] = useState<Project | null>(null);
  const { dialog, confirm } = useAsk();
  const bulk = useProjectsBulk(orgId, data.projects, reload, setError);
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
    {
      key: "x",
      header: "",
      className: "wl-cell-actions",
      cell: (p) => (
        <span className="wl-row-actions">
          <button type="button" className="wl-link-btn" onClick={() => setRenaming(p)}>Rename</button>
          <a className="wl-link-btn" href={hrefTo("people", ["access"])}>Access</a>
          <button type="button" className="wl-link-btn" onClick={() => void clear(p)}>Clear data</button>
          <button type="button" className="wl-link-btn wl-text-error" onClick={() => void remove(p)}>Delete</button>
        </span>
      ),
    },
  ];
  const shown = data.projects.filter((p) => matchesText(filter, p.name, p.slug, p.id));
  return (
    <Panel flush>
      {data.projects.length > 8 && <div className="wl-list-tools"><ListFilter value={filter} onChange={setFilter} placeholder="Filter projects" /></div>}
      {bulk.bar}
      {error && <div className="wl-banner wl-banner-error wl-panel-banner">{error}</div>}
      <Table paging={{ noun: "projects", key: "projects", reset: filter }} columns={columns} rows={shown} rowKey={(p) => p.id} select={bulk.select} empty={<Empty>No project matches “{filter}”.</Empty>} />
      {dialog}
      {renaming && <NewProjectForm orgId={orgId} project={renaming} reload={reload} onClose={() => setRenaming(null)} />}
    </Panel>
  );
}
