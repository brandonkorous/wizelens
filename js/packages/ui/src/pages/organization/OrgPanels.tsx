import { type FormEvent, useState } from "react";
import { loadAccount, type OrgWithProjects } from "../../data/account";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";

/** The organization's name. Owners and admins only; retention is under Data retention. */
export function OrgNameForm({ org }: { org: OrgWithProjects }) {
  const [name, setName] = useState(org.name);
  const [note, setNote] = useState<string | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void act(() => apiSend("PATCH", `./api/orgs/${org.id}`, { name }), () => void loadAccount()).then((err) => setNote(err ?? "Saved."));
  };
  return (
    <Panel title="Name">
      <form className="wl-form" onSubmit={save}>
        <FormRow>
          <Field label="Organization name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="wl-btn wl-btn-primary">Save</button>
        </FormRow>
        {note && <p className="wl-muted wl-small" role="status">{note}</p>}
      </form>
    </Panel>
  );
}

/** Owners only: the organization, its projects, keys, and all data go at once. Needs the name typed and the password. */
export function DeleteOrgPanel({ org }: { org: OrgWithProjects }) {
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const remove = (e: FormEvent) => {
    e.preventDefault();
    void act(() => apiSend("DELETE", `./api/orgs/${org.id}`, { password }), () => void loadAccount()).then(setError);
  };
  return (
    <Panel title="Delete this organization" className="wl-panel-danger">
      <p className="wl-muted wl-settings-note">This deletes {org.name} with all its projects, keys, alerts, and data. It cannot be undone.</p>
      <form className="wl-form" onSubmit={remove}>
        <FormRow>
          <Field label={`Type ${org.name} to confirm`} required value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <Field label="Your password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button type="submit" className="wl-btn wl-btn-danger" disabled={typed !== org.name}>Delete organization</button>
        </FormRow>
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
      </form>
    </Panel>
  );
}
