import { type FormEvent, useState } from "react";
import { auth, type Role } from "../../data/account";
import { act } from "../../data/useApi";
import { fmtDate } from "../../format";
import { inviteLink } from "../../shell/auth/flow";
import { CopyButton } from "../../ui/Badges";
import { Select } from "../../ui/Controls";
import { Field, FormRow } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { type Invite, type OrgData, ROLE_OPTIONS } from "./teamTypes";

interface Props {
  orgId: string;
  mail: boolean;
  reload: () => void;
}

function InviteForm({ orgId, mail, reload }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const invite = await auth((c) => c.organization.inviteMember({ email, role, organizationId: orgId }));
      setLink(inviteLink(invite.id));
      setEmail("");
    }, reload).then(setError);
  };
  return (
    <form className="wl-form" onSubmit={send}>
      <FormRow>
        <Field label="Invite by email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@company.com" />
        <Select label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
        <button type="submit" className="wl-btn wl-btn-primary">Invite</button>
      </FormRow>
      {link && (
        <div className="wl-share-link">
          <code className="wl-mono wl-small">{link}</code> <CopyButton text={link} label="Copy invite link" />
          <span className="wl-muted wl-small">Send this link to them. It works once, for 7 days.{mail && " We emailed it too."}</span>
        </div>
      )}
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
    </form>
  );
}

/** Invite people, and the invites that wait for an answer: copy the link, send it again, or cancel. */
export function InvitesPanel({ orgId, mail, data, reload }: Props & { data: OrgData }) {
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, done: string | null = null) => void act(fn, reload).then((err) => (setError(err), setNote(err ? null : done)));
  const resend = (i: Invite) => run(() => auth((c) => c.organization.inviteMember({ email: i.email, role: i.role, organizationId: orgId, resend: true })), mail ? `We sent the invite to ${i.email} again.` : "The invite works for 7 more days.");
  const cancel = (i: Invite) => window.confirm(`Cancel the invite for ${i.email}?`) && run(() => auth((c) => c.organization.cancelInvitation({ invitationId: i.id })));
  const columns: Column<Invite>[] = [
    { key: "email", header: "Email", cell: (i) => <strong>{i.email}</strong> },
    { key: "role", header: "Role", cell: (i) => i.role },
    { key: "ends", header: "Works until", cell: (i) => fmtDate(i.expiresMs) },
    {
      key: "x",
      header: "",
      cell: (i) => (
        <span className="wl-row-actions">
          <CopyButton text={inviteLink(i.id)} label="Copy link" />
          <button type="button" className="wl-link-btn" onClick={() => resend(i)}>Send again</button>
          <button type="button" className="wl-link-btn wl-text-error" onClick={() => cancel(i)}>Cancel</button>
        </span>
      ),
    },
  ];
  return (
    <Panel title={`Invites (${data.invites.length})`}>
      <InviteForm orgId={orgId} mail={mail} reload={reload} />
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {note && <p className="wl-muted wl-small" role="status">{note}</p>}
      <Table columns={columns} rows={data.invites} rowKey={(i) => i.id} empty={<Empty>No open invites.</Empty>} />
    </Panel>
  );
}
