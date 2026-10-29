import { useEffect, useState } from "react";
import { type AccountState, currentProject, errorText, isNotFresh, signOut } from "../../data/account";
import { allowApp, finishConsent, oauthRequest, type PublicClient, publicClient } from "../../data/oauth";
import { Dropdown } from "../../ui/Dropdown";
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

type Choice = { orgId: string; scope: Scope; picked: string[] };
const keepKey = (clientId: string) => `wl-consent:${clientId}`;

/** The choice kept in this tab while the person signs in again; null when none was kept or storage is off. */
function keptChoice(clientId: string): Choice | null {
  try {
    const raw = sessionStorage.getItem(keepKey(clientId));
    return raw ? (JSON.parse(raw) as Choice) : null;
  } catch {
    return null;
  }
}

/** Keep the choice for the sign-in; null forgets it. A private window keeps nothing, and the person picks again. */
function keepChoice(clientId: string, c: Choice | null): void {
  try {
    if (c) sessionStorage.setItem(keepKey(clientId), JSON.stringify(c));
    else sessionStorage.removeItem(keepKey(clientId));
  } catch {
    // Storage is off: nothing to keep.
  }
}

/** The organization, scope, and projects picked; after a safety sign-in, the ones picked before it. */
function useChoice(clientId: string, state: AccountState) {
  const orgs = state.orgs ?? [];
  const [kept] = useState(() => keptChoice(clientId));
  const [orgId, setOrgId] = useState(kept?.orgId ?? currentProject(state)?.org.id ?? orgs[0]?.id ?? "");
  const [scope, setScope] = useState<Scope>(kept?.scope ?? "some");
  const org = orgs.find((o) => o.id === orgId);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(kept?.picked ?? org?.projects.map((p) => p.id)));
  const pickOrg = (id: string) => (setOrgId(id), setPicked(new Set(orgs.find((o) => o.id === id)?.projects.map((p) => p.id))));
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const keep = (c: boolean) => keepChoice(clientId, c ? { orgId, scope, picked: [...picked] } : null);
  return { orgs, org, scope, setScope, picked, pickOrg, toggle, keep };
}

/** Pick an organization and its projects, then allow or deny. The choice is saved before the consent, as one grant. */
export function ConsentScreen({ query, state }: { query: string; state: AccountState }) {
  const { clientId, returnHost } = oauthRequest(query);
  const [client, setClient] = useState<PublicClient | null>(null);
  const { orgs, org, scope, setScope, picked, pickOrg, toggle, keep } = useChoice(clientId, state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => void publicClient(clientId).then(setClient, () => setClient({})), [clientId]);
  const name = client?.client_name || "This app";
  if (!org) return <AuthCard title="You are not in an organization" intro="Join or make an organization first, then connect the app again." />;
  const act = (fn: () => Promise<void>) => {
    keep(false);
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
        <div className="wl-auth-field">
          <span id="wl-consent-org">Organization</span>
          <Dropdown value={org.id} options={orgs.map((o): [string, string] => [o.id, o.name])} onChange={pickOrg} labelledBy="wl-consent-org" />
        </div>
      )}
      <fieldset className="wl-consent-scope">
        <legend>Projects in {org.name}</legend>
        <label className="wl-auth-check"><input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} /><span>All projects, also ones made later</span></label>
        <label className="wl-auth-check"><input type="radio" name="scope" checked={scope === "some"} onChange={() => setScope("some")} /><span>Only these projects</span></label>
        {scope === "some" && <ProjectPicks projects={org.projects} picked={picked} toggle={toggle} />}
      </fieldset>
      {stale && <div className="wl-banner wl-banner-info" role="status">For safety, sign in again first. Your choices here are kept. <button type="button" className="wl-link-btn" onClick={() => (keep(true), void signOut())}>Sign in again</button></div>}
      {error && <div className="wl-banner wl-banner-error" role="alert">{error}</div>}
      <button type="button" className="wl-btn wl-btn-primary" disabled={busy || none} onClick={allow}>{busy ? "One moment…" : `Allow ${name}`}</button>
      <button type="button" className="wl-link-btn" disabled={busy} onClick={() => act(() => finishConsent(query, false))}>Deny</button>
    </AuthCard>
  );
}
