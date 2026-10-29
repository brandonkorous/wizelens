import { useEffect, useState } from "react";
import { type AccountState, currentProject, errorText, isNotFresh, signOut } from "../../data/account";
import { allowApp, finishConsent, oauthRequest, type PublicClient, publicClient } from "../../data/oauth";
import { AuthCard } from "./AuthForm";

type Scope = "all" | "some";

/** The projects of one organization as check boxes. */
function ProjectPicks({ projects, picked, toggle }: { projects: { id: string; name: string }[]; picked: Set<string>; toggle: (id: string) => void }) {
  return (
    <div className="wl-consent-projects">
      {projects.map((p) => (
        <label key={p.id} className="wl-auth-check">
          <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
          <span>{p.name}</span>
        </label>
      ))}
    </div>
  );
}

/** What the app gets, in plain words. */
const WhatItGets = ({ name, returnHost }: { name: string; returnHost: string }) => (
  <ul className="wl-consent-list">
    <li>{name} can read traces, logs, errors, metrics, and reports. It cannot change anything.</li>
    <li>It keeps access until you remove it under Account → My apps. Every call goes to the audit log.</li>
    <li>After you allow, you go back to <b>{returnHost}</b>.</li>
  </ul>
);

/** Pick an organization and its projects, then allow or deny. The choice is saved before the consent, as one grant. */
export function ConsentScreen({ query, state }: { query: string; state: AccountState }) {
  const { clientId, returnHost } = oauthRequest(query);
  const orgs = state.orgs ?? [];
  const [client, setClient] = useState<PublicClient | null>(null);
  const [orgId, setOrgId] = useState(currentProject(state)?.org.id ?? orgs[0]?.id ?? "");
  const [scope, setScope] = useState<Scope>("some");
  const org = orgs.find((o) => o.id === orgId);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(org?.projects.map((p) => p.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => void publicClient(clientId).then(setClient, () => setClient({})), [clientId]);
  const name = client?.client_name || "This app";
  if (!org) return <AuthCard title="You are not in an organization" intro="Join or make an organization first, then connect the app again." />;
  const pickOrg = (id: string) => (setOrgId(id), setPicked(new Set(orgs.find((o) => o.id === id)?.projects.map((p) => p.id))));
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const act = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn().catch((e: unknown) => (isNotFresh(e) ? setStale(true) : setError(errorText(e)))).finally(() => setBusy(false));
  };
  const allow = () => act(() => allowApp(query, { organizationId: org.id, allProjects: scope === "all", projectIds: scope === "all" ? [] : [...picked] }));
  const none = scope === "some" && picked.size === 0;
  return (
    <AuthCard title={`Connect ${name}`} intro={`${name} wants to read your WizeLens data. Choose what it may see.`}>
      <WhatItGets name={name} returnHost={returnHost} />
      {orgs.length > 1 && (
        <label className="wl-auth-field">
          <span>Organization</span>
          <select className="wl-select" value={org.id} onChange={(e) => pickOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      <fieldset className="wl-consent-scope">
        <legend>Projects in {org.name}</legend>
        <label className="wl-auth-check"><input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} /><span>All projects, also ones made later</span></label>
        <label className="wl-auth-check"><input type="radio" name="scope" checked={scope === "some"} onChange={() => setScope("some")} /><span>Only these projects</span></label>
        {scope === "some" && <ProjectPicks projects={org.projects} picked={picked} toggle={toggle} />}
      </fieldset>
      {stale && <div className="wl-banner wl-banner-info" role="status">For safety, sign in again first. <button type="button" className="wl-link-btn" onClick={() => void signOut()}>Sign in again</button></div>}
      {error && <div className="wl-banner wl-banner-error" role="alert">{error}</div>}
      <button type="button" className="wl-btn wl-btn-primary" disabled={busy || none} onClick={allow}>{busy ? "One moment…" : `Allow ${name}`}</button>
      <button type="button" className="wl-link-btn" disabled={busy} onClick={() => act(() => finishConsent(query, false))}>Deny</button>
    </AuthCard>
  );
}
