import { type FormEvent, useState } from "react";
import { apiSend } from "../../data/api";
import { CopyButton } from "../../ui/Badges";
import { Check, Field, FormRow, SelectField } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import type { ApiKey, OrgData } from "./teamTypes";

type Kind = ApiKey["kind"];
const KINDS: [Kind, string][] = [
  ["ingest", "Ingest: an app sends data"],
  ["read", "Read: an AI agent or script reads data"],
];

/** What each kind of key may be limited to. */
export const SCOPES: Record<Kind, [string, string][]> = {
  ingest: [["traces", "Traces"], ["logs", "Logs"], ["metrics", "Metrics"]],
  read: [["api", "API (pages, search, exports)"], ["mcp", "MCP (AI agents)"]],
};

const EXPIRY: [string, string][] = [["", "Never"], ["30", "In 30 days"], ["90", "In 90 days"], ["180", "In 180 days"], ["365", "In 1 year"]];

/** The new secret, shown once, with where it goes. */
export function NewSecret({ kind, secret, note }: { kind: Kind; secret: string; note?: string }) {
  return (
    <div className="wl-share-link">
      <code className="wl-mono wl-small">{secret}</code> <CopyButton text={secret} label="Copy key" />
      <span className="wl-muted wl-small">
        Copy it now: it is not shown again. {kind === "ingest" ? "Set it as WIZELENS_HUB_TOKEN on the app." : "Send it as Authorization: Bearer <key> to /_wizelens/mcp."} {note}
      </span>
    </div>
  );
}

function ScopeChecks({ kind, scopes, onChange }: { kind: Kind; scopes: string[]; onChange: (s: string[]) => void }) {
  return (
    <fieldset className="wl-check-list">
      <legend>It may</legend>
      {SCOPES[kind].map(([s, label]) => <Check key={s} label={label} checked={scopes.includes(s)} onChange={(e) => onChange(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />)}
    </fieldset>
  );
}

/** Make a key. An ingest key sends to one project; a read key may read several. Both may expire and be limited. */
export function KeyForm({ orgId, data, reload, onClose }: { orgId: string; data: OrgData; reload: () => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("ingest");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(data.projects[0] ? [data.projects[0].id] : []);
  const [scopes, setScopes] = useState<string[]>(SCOPES.ingest.map(([s]) => s));
  const [expires, setExpires] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string, on: boolean) => setPicked((p) => (kind === "ingest" ? [id] : on ? [...p, id] : p.filter((x) => x !== id)));
  const pickKind = (k: Kind) => (setKind(k), setPicked((p) => p.slice(0, 1)), setScopes(SCOPES[k].map(([s]) => s)));
  const create = (e: FormEvent) => {
    e.preventDefault();
    const body = { kind, name, projectIds: kind === "ingest" ? picked.slice(0, 1) : picked, scopes, expiresInDays: expires ? Number(expires) : null };
    apiSend<{ token: string }>("POST", `./api/orgs/${orgId}/keys`, body).then(
      (k) => (setSecret(k.token), setName(""), setError(null), reload()),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    );
  };
  const projects = data.projects.map((p): [string, string] => [p.id, p.name]);
  return (
    <Panel title="New key" className="wl-panel-form" action={<button type="button" className="wl-link-btn" onClick={onClose}>{secret ? "Done" : "Close"}</button>}>
      <form className="wl-form" onSubmit={create}>
        <FormRow>
          <SelectField label="Kind" value={kind} options={KINDS} onChange={pickKind} />
          <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="orders-api" hint="Name it after the app or agent that uses it." />
          {kind === "ingest" && <SelectField label="Project" value={picked[0] ?? ""} options={projects} onChange={(id) => setPicked([id])} />}
          <SelectField label="Expires" value={expires} options={EXPIRY} onChange={setExpires} hint="It stops working then. Rotate it before." />
          <button type="submit" className="wl-btn wl-btn-primary" disabled={picked.length === 0 || scopes.length === 0}>Create key</button>
        </FormRow>
        {kind === "read" && (
          <fieldset className="wl-check-list">
            <legend>Projects it may read</legend>
            {data.projects.map((p) => <Check key={p.id} label={p.name} checked={picked.includes(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />)}
          </fieldset>
        )}
        <ScopeChecks kind={kind} scopes={scopes} onChange={setScopes} />
        {secret && <NewSecret kind={kind} secret={secret} />}
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
      </form>
    </Panel>
  );
}
