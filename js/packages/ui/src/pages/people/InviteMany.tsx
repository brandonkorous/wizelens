import { useMemo, useState } from "react";
import { type InviteRole, type InviteRow, parseInviteList } from "@wizeworks/lens-core/internal";
import { auth } from "../../data/account";
import { eachOne, eachText } from "../../data/bulk";
import { downloadCsv, toCsv } from "../../data/csv";
import { LIST_FILES, textOfFile } from "../../data/fileText";
import { inviteLink } from "../../shell/auth/flow";
import { FormRow, SelectField, TextArea } from "../../ui/Field";
import { FileDrop } from "../../ui/FileDrop";
import { Modal } from "../../ui/Modal";
import { PartsProgress } from "../../ui/OneTimeSecrets";
import { type Column, Table } from "../../ui/Table";
import { type OrgData, ROLE_HELP, ROLE_LABEL, ROLE_OPTIONS } from "../organization/orgTypes";

type Sent = InviteRow & { link: string };

const COLUMNS: Column<InviteRow>[] = [
  { key: "email", header: "Email", cell: (r) => <strong>{r.email}</strong> },
  { key: "role", header: "Role", cell: (r) => ROLE_LABEL[r.role] },
];

const saveLinks = (sent: Sent[]) => downloadCsv("invite-links", toCsv([["email", (s: Sent) => s.email], ["role", (s: Sent) => s.role], ["link", (s: Sent) => s.link]], sent));

/** Invite many people at once from a pasted list or a file; each gets the role in their row, or the one picked here. */
export function InviteMany({ orgId, mail, data, reload, onClose }: { orgId: string; mail: boolean; data: OrgData; reload: () => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [role, setRole] = useState<InviteRole>("member");
  const [done, setDone] = useState<number | null>(null);
  const [sent, setSent] = useState<{ list: Sent[]; error: string | null } | null>(null);
  const known = useMemo(() => new Set([...data.members.map((m) => m.email.toLowerCase()), ...data.invites.map((i) => i.email.toLowerCase())]), [data]);
  const parsed = useMemo(() => (text.trim() ? parseInviteList(text, known, role) : null), [text, known, role]);
  const rows = parsed?.problems.length === 0 ? parsed.rows : [];
  const start = async () => {
    setDone(0);
    const list: Sent[] = [];
    const send = async (r: InviteRow) => list.push({ ...r, link: inviteLink((await auth((c) => c.organization.inviteMember({ email: r.email, role: r.role, organizationId: orgId }))).id) });
    const run = await eachOne(rows, send, setDone);
    setDone(null);
    setSent({ list, error: eachText(run, rows.length, "Invited", (r) => r.email) });
    reload();
  };
  const pick = (file: File) => void textOfFile(file).then((t) => (setFileName(file.name), setText(t)));
  return (
    <Modal title="Invite many people" wide onClose={done === null ? onClose : undefined} closeLabel={sent ? "Done" : "Close"}>
      <div className="wl-form">
        {done !== null && <PartsProgress done={done} total={rows.length} what="Invited" />}
        {done === null && sent && <InviteResult sent={sent} mail={mail} />}
        {done === null && !sent && (
          <>
            <FileDrop accept={LIST_FILES} fileName={fileName} hint="Excel (.xlsx), CSV with email and role columns, or a list of emails." status={`${parsed?.rows.length ?? 0} people read.`} onFile={pick} />
            <FormRow>
              <TextArea label="Or paste emails" rows={4} value={text} onChange={(e) => (setFileName(null), setText(e.target.value))} placeholder={"sam@company.com, ana@company.com\nlee@company.com"} />
              <SelectField label="Role for rows with none" value={role} options={ROLE_OPTIONS} onChange={setRole} hint={ROLE_HELP[role]} />
            </FormRow>
            {parsed && parsed.problems.length > 0 && <div className="wl-banner wl-banner-error">{parsed.problems.slice(0, 10).map((p) => <div key={`${p.row}${p.message}`}>{p.row ? `Row ${p.row}: ` : ""}{p.message}</div>)}</div>}
            {rows.length > 0 && <Table paging={{ noun: "invites" }} columns={COLUMNS} rows={rows} rowKey={(r) => r.email} />}
          </>
        )}
        {done === null && (
          <div className="wl-form-actions">
            <button type="button" className="wl-btn" onClick={onClose}>{sent ? "Done" : "Cancel"}</button>
            {!sent && <button type="button" className="wl-btn wl-btn-primary" disabled={rows.length === 0} onClick={() => void start()}>Invite {rows.length} {rows.length === 1 ? "person" : "people"}</button>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function InviteResult({ sent, mail }: { sent: { list: Sent[]; error: string | null }; mail: boolean }) {
  return (
    <>
      {sent.error && <div className="wl-banner wl-banner-error">{sent.error}</div>}
      <p>
        Invited {sent.list.length} {sent.list.length === 1 ? "person" : "people"}. {mail ? "We emailed each one a link." : "Mail is off here, so send each person their link."} Links work once, for 7 days.{" "}
        {sent.list.length > 0 && <button type="button" className="wl-link-btn" onClick={() => saveLinks(sent.list)}>Download the links (CSV)</button>}
      </p>
    </>
  );
}
