import { type FormEvent, useState } from "react";
import { useOnce } from "../../ui/useOnce";
import { Plus } from "lucide-react";
import { apiSend } from "../../data/api";
import { act, useApi } from "../../data/useApi";
import { fmtAgo, fmtDate } from "../../format";
import { CopyButton } from "../../ui/Badges";
import { useAsk } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { type Column, Table } from "../../ui/Table";
import { PlanPrompt } from "../organization/PlanPrompt";

interface ScimToken {
  id: string;
  name: string;
  prefix: string;
  createdMs: number;
  lastUsedMs: number | null;
}

interface ScimInfo {
  allowed: boolean;
  baseUrl: string;
  tokens: ScimToken[];
}

/** A new token, shown once, for the identity provider's SCIM settings. */
function TokenForm({ orgId, reload, onClose }: { orgId: string; reload: () => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, once } = useOnce();
  const create = (e: FormEvent) => {
    e.preventDefault();
    once(() => apiSend<{ token: string }>("POST", `./api/orgs/${orgId}/scim/tokens`, { name }).then((r) => (setToken(r.token), setError(null), reload()), (err: unknown) => setError(err instanceof Error ? err.message : String(err))));
  };
  return (
    <Modal title="New SCIM token" onClose={onClose} closeLabel={token ? "Done" : "Close"}>
      <form className="wl-form" onSubmit={create}>
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Okta" hint="The identity provider that uses it." autoFocus />
        {token && (
          <div className="wl-share-link">
            <code className="wl-mono wl-small">{token}</code> <CopyButton text={token} label="Copy token" />
            <span className="wl-muted wl-small">Copy it now: it is not shown again. Paste it as the bearer token (API token) in the identity provider.</span>
          </div>
        )}
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <div className="wl-form-actions">
          <button type="button" className={token ? "wl-btn wl-btn-primary" : "wl-btn"} onClick={onClose}>{token ? "Done" : "Cancel"}</button>
          {!token && <button type="submit" className="wl-btn wl-btn-primary" disabled={busy}>Create token</button>}
        </div>
      </form>
    </Modal>
  );
}

function TokensPanel({ orgId, info, reload }: { orgId: string; info: ScimInfo; reload: () => void }) {
  const { dialog, confirm } = useAsk();
  const revoke = async (t: ScimToken) =>
    (await confirm({ title: `Revoke ${t.name}?`, body: "The identity provider can no longer add or remove people. People it added stay.", confirmLabel: "Revoke token", danger: true })) &&
    void act(() => apiSend("DELETE", `./api/orgs/${orgId}/scim/tokens/${t.id}`), reload);
  const columns: Column<ScimToken>[] = [
    { key: "name", header: "Token", cell: (t) => <span className="wl-who"><strong>{t.name}</strong><small className="wl-mono">{t.prefix}…</small></span> },
    { key: "made", header: "Created", cell: (t) => fmtDate(t.createdMs), className: "wl-nowrap" },
    { key: "used", header: "Last used", cell: (t) => (t.lastUsedMs ? fmtAgo(t.lastUsedMs) : "Never"), className: "wl-nowrap" },
    { key: "x", header: "", className: "wl-cell-actions", cell: (t) => <button type="button" className="wl-link-btn wl-text-error" onClick={() => void revoke(t)}>Revoke</button> },
  ];
  return (
    <Panel flush>
      {dialog}
      <Table paging={{ noun: "tokens", key: "tokens" }} columns={columns} rows={info.tokens} rowKey={(t) => t.id} empty={<Empty title="No SCIM token yet">Make one, then paste it with the base URL into Okta, Entra ID, or another identity provider.</Empty>} />
    </Panel>
  );
}

/** Owners and admins: the identity provider adds people as members, and removes them when they leave. */
export function ScimSection({ orgId, plan }: { orgId: string; plan: string }) {
  const { data, error, reload } = useApi<ScimInfo>(`./api/orgs/${orgId}/scim`);
  const [adding, setAdding] = useState(false);
  const add = data?.allowed && <button type="button" className="wl-btn wl-btn-primary" onClick={() => setAdding(true)}><Plus aria-hidden="true" /> New token</button>;
  return (
    <>
      <SectionHead title="SCIM provisioning" description="Your identity provider adds people as members and removes them when they are deactivated. Admins set roles here." action={add} />
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {data && !data.allowed && <PlanPrompt feature="scim" plan={plan} />}
      {data?.allowed && (
        <Panel>
          <div className="wl-share-link">
            <span className="wl-muted wl-small">SCIM base URL</span>
            <code className="wl-mono wl-small">{data.baseUrl}</code> <CopyButton text={data.baseUrl} />
          </div>
        </Panel>
      )}
      {adding && <TokenForm orgId={orgId} reload={reload} onClose={() => setAdding(false)} />}
      {data?.allowed && <TokensPanel orgId={orgId} info={data} reload={reload} />}
    </>
  );
}
