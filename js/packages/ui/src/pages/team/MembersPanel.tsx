import { type FormEvent, useState } from "react";
import type { Role } from "../../data/account";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { fmtDate } from "../../format";
import { CopyButton } from "../../ui/Badges";
import { Select } from "../../ui/Controls";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { canManage, type Member, type OrgData, ROLE_OPTIONS } from "./teamTypes";

function InviteForm({ orgId, reload }: { orgId: string; reload: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = (e: FormEvent) => {
    e.preventDefault();
    apiSend<{ url: string }>("POST", `./api/orgs/${orgId}/invites`, { email, role }).then(
      (r) => (setLink(r.url), setEmail(""), setError(null), reload()),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    );
  };
  return (
    <form className="wl-form" onSubmit={send}>
      <FormRow>
        <Field label="Invite by email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@company.com" />
        <Select label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
        <button type="submit" className="wl-btn wl-btn-primary">Make invite link</button>
      </FormRow>
      {link && (
        <div className="wl-share-link">
          <code className="wl-mono wl-small">{link}</code> <CopyButton text={link} label="Copy invite link" />
          <span className="wl-muted wl-small">Send this link to them. It works once, for 7 days.</span>
        </div>
      )}
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
    </form>
  );
}

function columns(orgId: string, manage: boolean, reload: () => void, onError: (e: string | null) => void): Column<Member>[] {
  const change = (m: Member, role: Role) => void act(() => apiSend("PATCH", `./api/orgs/${orgId}/members/${m.userId}`, { role }), reload).then(onError);
  const remove = (m: Member) => void act(() => apiSend("DELETE", `./api/orgs/${orgId}/members/${m.userId}`), reload).then(onError);
  return [
    { key: "name", header: "Name", cell: (m) => <><strong>{m.name}</strong> <span className="wl-muted wl-small">{m.email}</span></> },
    { key: "role", header: "Role", cell: (m) => (manage ? <Select small label={`Role of ${m.name}`} value={m.role} options={ROLE_OPTIONS} onChange={(r) => change(m, r)} /> : m.role) },
    { key: "since", header: "Member since", cell: (m) => fmtDate(m.sinceMs) },
    ...(manage ? [{ key: "x", header: "", cell: (m: Member) => <button type="button" className="wl-link-btn wl-text-error" onClick={() => remove(m)}>Remove</button> }] : []),
  ];
}

/** Who is in the organization, their roles, and invites. */
export function MembersPanel({ orgId, data, reload }: { orgId: string; data: OrgData; reload: () => void }) {
  const manage = canManage(data.role);
  const [error, setError] = useState<string | null>(null);
  return (
    <Panel title={`Members (${data.members.length})`}>
      {manage && <InviteForm orgId={orgId} reload={reload} />}
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      <Table columns={columns(orgId, manage, reload, setError)} rows={data.members} rowKey={(m) => m.userId} />
      {data.invites.length > 0 && <p className="wl-muted wl-small">Waiting for: {data.invites.map((i) => `${i.email} (${i.role})`).join(", ")}</p>}
    </Panel>
  );
}
