import { type FormEvent, useEffect, useRef, useState } from "react";
import { useOnce } from "../../ui/useOnce";
import { currentProject, useAccount } from "../../data/account";
import { apiSend } from "../../data/api";
import { CopyButton } from "../../ui/Badges";
import { Check, Field, FormRow, SelectField } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import type { ApiKey, OrgData } from "../organization/orgTypes";
import { hereUrl, Snippet } from "./Snippet";

export type Kind = ApiKey["kind"];

/** Keys that send data (apps and sites), and keys that read it (agents and scripts). */
export const SENDING: readonly Kind[] = ["ingest", "browser"];
export const READING: readonly Kind[] = ["read"];
const KINDS: [Kind, string][] = [
  ["ingest", "Ingest: an app sends data"],
  ["read", "Read: an AI agent or script reads data"],
  ["browser", "Browser: a site with no WizeLens server sends page data"],
];

/** What each kind of key may be limited to. */
export const SCOPES: Record<Kind, [string, string][]> = {
  ingest: [["traces", "Traces"], ["logs", "Logs"], ["metrics", "Metrics"]],
  read: [["api", "API (pages, search, exports)"], ["mcp", "MCP (AI agents)"]],
  browser: [["traces", "Page spans"], ["logs", "Console lines"]],
};

/** Where each kind of secret goes. */
const WHERE: Record<Kind, string> = {
  ingest: "Set it as WIZELENS_HUB_TOKEN on the app.",
  read: "Send it as Authorization: Bearer <key> to /_wizelens/mcp.",
  browser: "It is public: it is safe in a page. Put this tag in every page, before </body>:",
};

const EXPIRY: [string, string][] = [["", "Never"], ["30", "In 30 days"], ["90", "In 90 days"], ["180", "In 180 days"], ["365", "In 1 year"]];

const CDN = "https://cdn.jsdelivr.net/npm/@wizeworks/lens-browser/dist/wizelens.iife.js";

/** The whole script tag for a browser key; a cloud other than WizeLens Cloud names its own address. */
export function scriptTag(key: string, cloud: string): string {
  const at = cloud === "https://app.wizelens.com" ? "" : ` data-endpoint="${cloud}"`;
  return `<script src="${CDN}" data-key="${key}"${at} data-hud="false"></script>`;
}

/** The new secret, shown once, with where it goes; a browser key comes with its script tag. */
export function NewSecret({ kind, secret, note, name }: { kind: Kind; secret: string; note?: string; name?: string }) {
  // On a phone the box lands under the form: bring it up so the key is seen.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.scrollIntoView({ block: "nearest" }), [secret]);
  return (
    <div className="wl-share-link" ref={box}>
      {name && <strong>{name}</strong>}
      <code className="wl-mono wl-small">{secret}</code> <CopyButton text={secret} label="Copy key" />
      <span className="wl-muted wl-small">
        Copy it now: it is not shown again. {WHERE[kind]} {note}
      </span>
      {kind === "browser" && <Snippet label="Script tag" text={scriptTag(secret, hereUrl())} />}
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

/** The body that makes a key. Ingest and browser keys send to one project; a browser key also lists its sites. */
function keyBody(kind: Kind, name: string, picked: string[], scopes: string[], expires: string, origins: string) {
  const base = { kind, name, projectIds: kind === "read" ? picked : picked.slice(0, 1), scopes, expiresInDays: expires ? Number(expires) : null };
  return kind === "browser" ? { ...base, origins } : base;
}

/** Make a key of one of `kinds`. An ingest or browser key sends to one project; a read key may read several. All may expire and be limited. */
export function KeyForm({ orgId, data, kinds, reload, onClose }: { orgId: string; data: OrgData; kinds: readonly Kind[]; reload: () => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(kinds[0]!);
  const [name, setName] = useState("");
  // Starts on the project the dashboard shows now; under "All projects", on the first.
  const here = currentProject(useAccount())?.project?.id;
  const start = data.projects.find((p) => p.id === here) ?? data.projects[0];
  const [picked, setPicked] = useState<string[]>(start ? [start.id] : []);
  const [scopes, setScopes] = useState<string[]>(SCOPES[kinds[0]!].map(([s]) => s));
  const [expires, setExpires] = useState("");
  const [origins, setOrigins] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [made, setMade] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { busy, once } = useOnce();
  const toggle = (id: string, on: boolean) => setPicked((p) => (kind !== "read" ? [id] : on ? [...p, id] : p.filter((x) => x !== id)));
  const pickKind = (k: Kind) => (setKind(k), setPicked((p) => p.slice(0, 1)), setScopes(SCOPES[k].map(([s]) => s)));
  const create = (e: FormEvent) => {
    e.preventDefault();
    once(() => apiSend<{ token: string }>("POST", `./api/orgs/${orgId}/keys`, keyBody(kind, name, picked, scopes, expires, origins)).then(
      (k) => (setSecret(k.token), setMade(name), setName(""), setError(null), reload()),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    ));
  };
  const projects = data.projects.map((p): [string, string] => [p.id, p.name]);
  return (
    <Modal title={kinds.includes("read") ? "New read key" : "New sending key"} onClose={onClose} closeLabel={secret ? "Done" : "Close"}>
      <form className="wl-form" onSubmit={create}>
        <FormRow>
          {kinds.length > 1 && <SelectField label="Kind" value={kind} options={KINDS.filter(([k]) => kinds.includes(k))} onChange={pickKind} />}
          <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="orders-api" hint="Name it after the app or agent that uses it." />
          {kind !== "read" && <SelectField label="Project" value={picked[0] ?? ""} options={projects} onChange={(id) => setPicked([id])} />}
          <SelectField label="Expires" value={expires} options={EXPIRY} onChange={setExpires} hint="It stops working then. Rotate it before." />
        </FormRow>
        {kind === "browser" && (
          <Field label="Sites" required value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://shop.example.com" hint="Only pages on these sites may send with it. Put a space or comma between sites; https://*.example.com takes its subdomains." />
        )}
        {kind === "read" && (
          <fieldset className="wl-check-list">
            <legend>Projects it may read</legend>
            {data.projects.map((p) => <Check key={p.id} label={p.name} checked={picked.includes(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />)}
          </fieldset>
        )}
        <ScopeChecks kind={kind} scopes={scopes} onChange={setScopes} />
        {secret && <NewSecret kind={kind} secret={secret} name={made} />}
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <div className="wl-form-actions">
          <button type="button" className="wl-btn" onClick={onClose}>{secret ? "Done" : "Cancel"}</button>
          <button type="submit" className="wl-btn wl-btn-primary" disabled={picked.length === 0 || scopes.length === 0 || busy}>{secret ? "Create another key" : "Create key"}</button>
        </div>
      </form>
    </Modal>
  );
}
