import { type FormEvent, useState } from "react";
import { auth, type Role } from "../../data/account";
import { act } from "../../data/useApi";
import { fmtDate } from "../../format";
import { inviteLink } from "../../shell/auth/flow";
import { CopyButton } from "../../ui/Badges";
import { useAsk } from "../../ui/Dialog";
import { Field, FormRow, SelectField } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { type Invite, type OrgData, ROLE_HELP, ROLE_LABEL, ROLE_OPTIONS } from "../organization/orgTypes";

interface Props {
  orgId: string;
  mail: boolean;
  reload: () => void;
}

/** Invite one person by email. The link shows once it is made, to copy when mail is off. */
export function InviteForm({ orgId, mail, reload, onClose }: Props & { onClose: () => void }) {
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
    <Modal title="Invite someone" onClose={onClose} closeLabel={link ? "Done" : "Close"}>
      <form className="wl-form" onSubmit={send}>
        <FormRow>
          <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@company.com" autoFocus />
          <SelectField label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} hint={ROLE_HELP[role]} />
        </FormRow>
        {link && (
          <div className="wl-share-link">
            <code className="wl-mono wl-small">{link}</code> <CopyButton text={link} label="Copy invite link" />
            <span className="wl-muted wl-small">Send this link to them. It works once, for 7 days.{mail && " We emailed it too."}</span>
          </div>
        )}
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <div className="wl-form-actions">
          <button type="button" className="wl-btn" onClick={onClose}>{link ? "Done" : "Cancel"}</button>
          <button type="submit" className="wl-btn wl-btn-primary">{link ? "Invite someone else" : "Send invite"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Invites that wait for an answer: copy the link, send it again, or cancel. */
export function InvitesPanel({ orgId, mail, data, reload }: Props & { data: OrgData }) {
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { dialog, confirm } = useAsk();
  const run = (fn: () => Promise<unknown>, done: string | null = null) => void act(fn, reload).then((err) => (setError(err), setNote(err ? null : done)));
  const resend = (i: Invite) => run(() => auth((c) => c.organization.inviteMember({ email: i.email, role: i.role, organizationId: orgId, resend: true })), mail ? `We sent the invite to ${i.email} again.` : "The invite works for 7 more days.");
  const cancel = async (i: Invite) =>
    (await confirm({ title: "Cancel this invite?", body: `The link for ${i.email} stops working.`, confirmLabel: "Cancel invite", danger: true })) &&
    run(() => auth((c) => c.organization.cancelInvitation({ invitationId: i.id })));
  const columns: Column<Invite>[] = [
    { key: "email", header: "Email", cell: (i) => <strong>{i.email}</strong> },
    { key: "role", header: "Role", cell: (i) => ROLE_LABEL[i.role] },
    { key: "ends", header: "Link works until", cell: (i) => fmtDate(i.expiresMs), className: "wl-nowrap" },
    {
      key: "x",
      header: "",
      className: "wl-cell-actions",
      cell: (i) => (
        <span className="wl-row-actions">
          <CopyButton text={inviteLink(i.id)} label="Copy link" asLink />
          <button type="button" className="wl-link-btn" onClick={() => resend(i)}>{mail ? "Send again" : "Extend"}</button>
          <button type="button" className="wl-link-btn wl-text-error" onClick={() => void cancel(i)}>Cancel</button>
        </span>
      ),
    },
  ];
  return (
    <Panel title="Pending invites" flush>
      {error && <div className="wl-banner wl-banner-error wl-panel-banner">{error}</div>}
      {note && <p className="wl-panel-note" role="status">{note}</p>}
      <Table columns={columns} rows={data.invites} rowKey={(i) => i.id} empty={<Empty>No open invites.</Empty>} />
      {dialog}
    </Panel>
  );
}
