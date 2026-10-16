import { type FormEvent, useState } from "react";
import { loadAccount, type OrgWithProjects } from "../../data/account";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import type { OrgData } from "./teamTypes";
import type { Project } from "../../data/account";

/** Organization name and how long it keeps data. Owners and admins only. */
export function OrgSettings({ org }: { org: OrgWithProjects }) {
  const [name, setName] = useState(org.name);
  const [days, setDays] = useState(org.retentionDays);
  const [note, setNote] = useState<string | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void act(() => apiSend("PATCH", `./api/orgs/${org.id}`, { name, retentionDays: days }), () => void loadAccount()).then((err) => setNote(err ?? "Saved."));
  };
  return (
    <Panel title="Organization">
      <form className="wl-form" onSubmit={save}>
        <FormRow>
          <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Keep data for (days)" type="number" min={1} max={400} required value={days} onChange={(e) => setDays(Number(e.target.value))} hint="Older traces are deleted every few minutes." />
          <button type="submit" className="wl-btn wl-btn-primary">Save</button>
        </FormRow>
        {note && <p className="wl-muted wl-small">{note}</p>}
      </form>
    </Panel>
  );
}

/** Projects of the organization: add one, clear its data, or delete it. */
export function ProjectsPanel({ orgId, data, reload }: { orgId: string; data: OrgData; reload: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const after = () => (reload(), void loadAccount());
  const run = (fn: () => Promise<unknown>) => void act(fn, after).then(setError);
  const add = (e: FormEvent) => {
    e.preventDefault();
    run(() => apiSend("POST", `./api/orgs/${orgId}/projects`, { name }));
    setName("");
  };
  const ask = (text: string) => window.prompt(`${text}\nType DELETE to confirm.`) === "DELETE";
  const columns: Column<Project>[] = [
    { key: "name", header: "Project", cell: (p) => <><strong>{p.name}</strong> <code className="wl-mono wl-small wl-muted">{p.id}</code></> },
    {
      key: "x",
      header: "",
      cell: (p) => (
        <span className="wl-row-actions">
          <button type="button" className="wl-link-btn" onClick={() => ask(`Delete all traces of ${p.name}? Settings and keys stay.`) && run(() => apiSend("POST", `./api/orgs/${orgId}/projects/${p.id}/clear`))}>Clear data</button>
          <button type="button" className="wl-link-btn wl-text-error" onClick={() => ask(`Delete ${p.name} and all its data and keys?`) && run(() => apiSend("DELETE", `./api/orgs/${orgId}/projects/${p.id}`))}>Delete</button>
        </span>
      ),
    },
  ];
  return (
    <Panel title={`Projects (${data.projects.length})`}>
      <form className="wl-form" onSubmit={add}>
        <FormRow>
          <Field label="New project" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Checkout" />
          <button type="submit" className="wl-btn wl-btn-primary">Add project</button>
        </FormRow>
      </form>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      <Table columns={columns} rows={data.projects} rowKey={(p) => p.id} />
    </Panel>
  );
}
