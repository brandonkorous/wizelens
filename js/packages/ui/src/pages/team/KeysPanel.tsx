import { type FormEvent, useState } from "react";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { fmtAgo, fmtDate } from "../../format";
import { Badge, CopyButton } from "../../ui/Badges";
import { Select } from "../../ui/Controls";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import type { ApiKey, OrgData } from "./teamTypes";

type Kind = ApiKey["kind"];
const KINDS: [Kind, string][] = [
  ["ingest", "Ingest: an app sends data"],
  ["read", "Read: an AI agent or script reads data"],
];

function KeyForm({ orgId, data, reload }: { orgId: string; data: OrgData; reload: () => void }) {
  const [kind, setKind] = useState<Kind>("ingest");
  const [name, setName] = useState("");
  const [project, setProject] = useState(data.projects[0]?.id ?? "");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = (e: FormEvent) => {
    e.preventDefault();
    apiSend<{ token: string }>("POST", `./api/orgs/${orgId}/keys`, { kind, name, projectIds: [project] }).then(
      (k) => (setSecret(k.token), setName(""), setError(null), reload()),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    );
  };
  const projects = data.projects.map((p): [string, string] => [p.id, p.name]);
  return (
    <form className="wl-form" onSubmit={create}>
      <FormRow>
        <Select label="Kind" value={kind} options={KINDS} onChange={setKind} />
        <Select label="Project" value={project} options={projects} onChange={setProject} />
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="orders-api (staging)" />
        <button type="submit" className="wl-btn wl-btn-primary">Create key</button>
      </FormRow>
      {secret && (
        <div className="wl-share-link">
          <code className="wl-mono wl-small">{secret}</code> <CopyButton text={secret} label="Copy key" />
          <span className="wl-muted wl-small">
            Copy it now: it is not shown again.{" "}
            {kind === "ingest" ? "Set it as WIZELENS_HUB_TOKEN on the app." : "Send it as Authorization: Bearer <key> to /_wizelens/mcp."}
          </span>
        </div>
      )}
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
    </form>
  );
}

/** Ingest keys (apps send with them) and read keys (agents read with them). */
export function KeysPanel({ orgId, data, reload }: { orgId: string; data: OrgData; reload: () => void }) {
  const names = new Map(data.projects.map((p) => [p.id, p.name]));
  const revoke = (k: ApiKey) => void act(() => apiSend("DELETE", `./api/orgs/${orgId}/keys/${k.id}`), reload);
  const columns: Column<ApiKey>[] = [
    { key: "name", header: "Key", cell: (k) => <><strong>{k.name}</strong> <code className="wl-mono wl-small wl-muted">{k.prefix}…</code></> },
    { key: "kind", header: "Kind", cell: (k) => <Badge tone={k.kind === "ingest" ? "info" : "neutral"}>{k.kind}</Badge> },
    { key: "projects", header: "Project", cell: (k) => k.projectIds.map((id) => names.get(id) ?? id).join(", ") },
    { key: "made", header: "Created", cell: (k) => fmtDate(k.createdMs) },
    { key: "used", header: "Last used", cell: (k) => (k.lastUsedMs ? fmtAgo(k.lastUsedMs) : "Never") },
    { key: "x", header: "", cell: (k) => <button type="button" className="wl-link-btn wl-text-error" onClick={() => revoke(k)}>Revoke</button> },
  ];
  return (
    <Panel title="Keys">
      <KeyForm orgId={orgId} data={data} reload={reload} />
      <Table columns={columns} rows={data.keys} rowKey={(k) => k.id} />
    </Panel>
  );
}
