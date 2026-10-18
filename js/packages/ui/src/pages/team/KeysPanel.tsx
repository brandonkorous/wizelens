import { type FormEvent, useState } from "react";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { fmtAgo, fmtDate } from "../../format";
import { Badge, CopyButton } from "../../ui/Badges";
import { useAsk } from "../../ui/Dialog";
import { Check, Field, FormRow, SelectField } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import type { ApiKey, OrgData } from "./teamTypes";

type Kind = ApiKey["kind"];
const KINDS: [Kind, string][] = [
  ["ingest", "Ingest: an app sends data"],
  ["read", "Read: an AI agent or script reads data"],
];

/** The new secret, shown once, with where it goes. */
function NewSecret({ kind, secret }: { kind: Kind; secret: string }) {
  return (
    <div className="wl-share-link">
      <code className="wl-mono wl-small">{secret}</code> <CopyButton text={secret} label="Copy key" />
      <span className="wl-muted wl-small">
        Copy it now: it is not shown again. {kind === "ingest" ? "Set it as WIZELENS_HUB_TOKEN on the app." : "Send it as Authorization: Bearer <key> to /_wizelens/mcp."}
      </span>
    </div>
  );
}

/** Make a key. An ingest key sends to one project; a read key may read several. */
export function KeyForm({ orgId, data, reload, onClose }: { orgId: string; data: OrgData; reload: () => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("ingest");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(data.projects[0] ? [data.projects[0].id] : []);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string, on: boolean) => setPicked((p) => (kind === "ingest" ? [id] : on ? [...p, id] : p.filter((x) => x !== id)));
  const create = (e: FormEvent) => {
    e.preventDefault();
    apiSend<{ token: string }>("POST", `./api/orgs/${orgId}/keys`, { kind, name, projectIds: kind === "ingest" ? picked.slice(0, 1) : picked }).then(
      (k) => (setSecret(k.token), setName(""), setError(null), reload()),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    );
  };
  const projects = data.projects.map((p): [string, string] => [p.id, p.name]);
  return (
    <Panel title="New key" className="wl-panel-form" action={<button type="button" className="wl-link-btn" onClick={onClose}>{secret ? "Done" : "Close"}</button>}>
      <form className="wl-form" onSubmit={create}>
        <FormRow>
          <SelectField label="Kind" value={kind} options={KINDS} onChange={(k) => (setKind(k), setPicked((p) => p.slice(0, 1)))} />
          <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="orders-api" hint="Name it after the app or agent that uses it." />
          {kind === "ingest" && <SelectField label="Project" value={picked[0] ?? ""} options={projects} onChange={(id) => setPicked([id])} />}
          <button type="submit" className="wl-btn wl-btn-primary" disabled={picked.length === 0}>Create key</button>
        </FormRow>
        {kind === "read" && (
          <fieldset className="wl-check-list">
            <legend>Projects it may read</legend>
            {data.projects.map((p) => <Check key={p.id} label={p.name} checked={picked.includes(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />)}
          </fieldset>
        )}
        {secret && <NewSecret kind={kind} secret={secret} />}
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
      </form>
    </Panel>
  );
}

/** Ingest keys (apps send with them) and read keys (agents read with them). */
export function KeysPanel({ orgId, data, reload }: { orgId: string; data: OrgData; reload: () => void }) {
  const names = new Map(data.projects.map((p) => [p.id, p.name]));
  const { dialog, confirm } = useAsk();
  const revoke = async (k: ApiKey) =>
    (await confirm({ title: `Revoke ${k.name}?`, body: k.kind === "ingest" ? "Apps that send with this key stop being recorded at once." : "Agents and scripts that read with this key lose access at once.", confirmLabel: "Revoke key", danger: true })) &&
    void act(() => apiSend("DELETE", `./api/orgs/${orgId}/keys/${k.id}`), reload);
  const columns: Column<ApiKey>[] = [
    { key: "name", header: "Key", cell: (k) => <span className="wl-who"><strong>{k.name}</strong><small className="wl-mono">{k.prefix}…</small></span> },
    { key: "kind", header: "Kind", cell: (k) => <Badge tone={k.kind === "ingest" ? "info" : "neutral"}>{k.kind === "ingest" ? "Ingest" : "Read"}</Badge> },
    { key: "projects", header: "Projects", cell: (k) => k.projectIds.map((id) => names.get(id) ?? "Deleted project").join(", "), className: "wl-wrap" },
    { key: "made", header: "Created", cell: (k) => fmtDate(k.createdMs), className: "wl-nowrap" },
    { key: "used", header: "Last used", cell: (k) => (k.lastUsedMs ? fmtAgo(k.lastUsedMs) : "Never"), className: "wl-nowrap" },
    { key: "x", header: "", className: "wl-cell-actions", cell: (k) => <button type="button" className="wl-link-btn wl-text-error" onClick={() => void revoke(k)}>Revoke</button> },
  ];
  return (
    <Panel flush>
      <Table columns={columns} rows={data.keys} rowKey={(k) => k.id} empty={<Empty title="No keys yet">Make an ingest key for each app that sends data.</Empty>} />
      {dialog}
    </Panel>
  );
}
