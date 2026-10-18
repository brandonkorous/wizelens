import { type FormEvent, useState } from "react";
import { loadAccount, type OrgWithProjects } from "../../data/account";
import { apiSend } from "../../data/api";
import { setProjectScope } from "../../data/prefs";
import { act } from "../../data/useApi";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";

/** A new organization, owned by you, with a first project. The dashboard switches to it. */
export function NewOrgPanel() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const org = await apiSend<{ id: string }>("POST", "./api/orgs", { name });
      const first = (await loadAccount()).orgs?.find((o) => o.id === org.id)?.projects[0];
      if (first) setProjectScope(first.id);
      setName("");
    }, () => void loadAccount()).then(setError);
  };
  return (
    <Panel title="New organization">
      <form className="wl-form" onSubmit={create}>
        <FormRow>
          <Field label="Name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme" />
          <button type="submit" className="wl-btn wl-btn-primary">Create organization</button>
        </FormRow>
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
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
    <Panel title="Delete organization" className="wl-panel-danger">
      <p className="wl-muted">This deletes {org.name} with all its projects, keys, alerts, and data. It cannot be undone.</p>
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
